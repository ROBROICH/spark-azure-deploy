import logging
from asyncio import CancelledError
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from temporalio import workflow
from temporalio.client import Interceptor as ClientInterceptor
from temporalio.client import OutboundInterceptor, StartWorkflowInput
from temporalio.common import RetryPolicy
from temporalio.exceptions import FailureError
from temporalio.worker import (
    ExecuteWorkflowInput,
    WorkflowInboundInterceptor,
    WorkflowInterceptorClassInput,
)
from temporalio.worker import Interceptor as WorkerInterceptor
from temporalio import workflow
from temporal.tracking_client import StatusPayload, TrackingClient

logger = logging.getLogger("temporal.interceptors.workflow_tracking")

_STATUS_ACTIVITY = "_post_status_activity"
_TRACKING_PATCH_ID = "workflow-tracking-activities"


class _TrackingClientOutbound(OutboundInterceptor):
    def __init__(self, next: OutboundInterceptor, tracker: TrackingClient) -> None:
        super().__init__(next)
        self._tracker = tracker

    async def start_workflow(self, input: StartWorkflowInput) -> Any:
        handle = await super().start_workflow(input)
        if _parent_id(input) is not None:
            return handle
        try:
            payload = StatusPayload(
                workflow_id=input.id,
                run_id=(
                    getattr(handle, "first_execution_run_id", None)
                    or getattr(handle, "result_run_id", "")
                    or ""
                ),
                workflow_type=_workflow_type_name(input.workflow),
                timestamp=datetime.now(UTC),
                project_id=_search_attr(
                    getattr(input, "search_attributes", {}), "ProjectId"
                ),
                project_version=_search_attr(
                    getattr(input, "search_attributes", {}), "ProjectVersion"
                ),
                status="pending",
            )
            await self._tracker.post_status(payload)
        except Exception:
            logger.exception("failed to schedule pending notification")
        return handle


class WorkflowTrackingInterceptor(ClientInterceptor):
    def __init__(self, tracker: TrackingClient) -> None:
        self._tracker = tracker

    def intercept_client(self, next: OutboundInterceptor) -> OutboundInterceptor:
        return _TrackingClientOutbound(next, self._tracker)


class _TrackingWorkflowInbound(WorkflowInboundInterceptor):
    async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:
        info = workflow.info()
        if info.parent is not None:
            return await self.next.execute_workflow(input)

        tracking_enabled = workflow.patched(_TRACKING_PATCH_ID)

        if tracking_enabled:
            try:
                await workflow.start_activity(
                    _STATUS_ACTIVITY,
                    StatusPayload(
                        workflow_id=info.workflow_id,
                        run_id=info.run_id,
                        status="running",
                        workflow_type=info.workflow_type,
                        timestamp=workflow.now(),
                    ),
                    schedule_to_close_timeout=timedelta(seconds=10),
                )
            except Exception:
                workflow.logger.exception("failed to schedule running notification")

        status = "completed"
        failure_msg: str | None = None
        try:
            return await self.next.execute_workflow(input)
        except CancelledError:
            status, failure_msg = "cancelled", "cancelled"
            raise
        except FailureError as e:
            status, failure_msg = "failed", str(e)[:500]
            raise
        except Exception as e:
            status, failure_msg = "failed", str(e)[:500]
            raise
        finally:
            if tracking_enabled:
                try:
                    await workflow.execute_activity(
                        _STATUS_ACTIVITY,
                        StatusPayload(
                            workflow_id=info.workflow_id,
                            run_id=info.run_id,
                            workflow_type=info.workflow_type,
                            project_id=_search_attr_workflow("ProjectId"),
                            project_version=_search_attr_workflow("ProjectVersion"),
                            status=status,
                            failure_message=failure_msg,
                            timestamp=datetime.now(UTC),
                        ),
                        schedule_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=3),
                    )
                except Exception:
                    workflow.logger.exception("failed to schedule running notification")



class WorkflowTrackingWorkerInterceptor(WorkerInterceptor):
    def workflow_interceptor_class(
        self, input: WorkflowInterceptorClassInput
    ) -> type[WorkflowInboundInterceptor]:
        return _TrackingWorkflowInbound


def _parent_id(input: StartWorkflowInput) -> str | None:
    attrs = getattr(input, "search_attributes", None)
    if not attrs:
        return None
    return _search_attr(attrs, "ParentWorkflowId")


def _workflow_type_name(workflow_ref: Any) -> str:
    if isinstance(workflow_ref, str):
        return workflow_ref
    return getattr(workflow_ref, "__name__", None) or str(workflow_ref)


def _search_attr(attrs: Any, key: str) -> Any | None:
    if not attrs:
        return None
    raw = attrs.get(key, None)
    if raw is None:
        return None
    return raw


def _search_attr_workflow(key: str) -> str | None:
    try:
        attrs = workflow.info().search_attributes
    except Exception:
        return None
    if not attrs:
        return None
    raw = attrs.get(key) if isinstance(attrs, dict) else None
    if raw is None:
        return None
    val = raw[0] if isinstance(raw, list) and raw else raw
    return str(val) if val is not None else None
