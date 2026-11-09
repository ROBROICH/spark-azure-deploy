from __future__ import annotations

import asyncio
import time
from enum import Enum, StrEnum
from typing import Any, Awaitable, Type, TypeVar

from event_logging import EventLogger, LoggingSettings
from event_logging.enums import EventCategory, EventOutcome
from event_logging.settings import Environment
from temporalio import activity, workflow
from temporalio.activity import Info as ActivityInfo
from temporalio.exceptions import ApplicationError
from temporalio.worker import (
    ActivityInboundInterceptor,
    ExecuteActivityInput,
    ExecuteWorkflowInput,
    Interceptor,
    WorkflowInboundInterceptor,
    WorkflowInterceptorClassInput,
)
from temporalio.workflow import Info as WorkflowInfo

from temporal.interceptors._cancellation import activity_ends_cancelled, ends_cancelled

T = TypeVar("T")


class TemporalEventAction(str, Enum):
    WORKFLOW_EXECUTE = "workflow_execute"
    ACTIVITY_EXECUTE = "activity_execute"


class _RunEnd(StrEnum):
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


def _ends_cancelled(error: BaseException, info: ActivityInfo | WorkflowInfo) -> bool:
    """Whether Temporal ends the activity or workflow as cancelled because of this error."""
    if isinstance(info, ActivityInfo):
        return activity_ends_cancelled(error)
    return ends_cancelled(error)


def _is_workflow_replay(info: ActivityInfo | WorkflowInfo) -> bool:
    """Whether a worker re-runs the workflow from its history, whose events were logged when they happened.

    Outside a workflow event loop, Python is closing a run a stopped worker left behind; it did not end.
    With several workers in one process another run's loop can be current then; entry points start one.
    """
    return isinstance(info, WorkflowInfo) and (not workflow.in_workflow() or workflow.unsafe.is_replaying())


def _log_end(
    logger: EventLogger,
    end: _RunEnd,
    action: TemporalEventAction,
    entity_type: str,
    entity_name: str,
    *,
    error_message: str,
    duration_ns: int,
    trace_id: str | None,
    process_id: str | None,
) -> None:
    if end == _RunEnd.FAILED:
        logger.error(
            action=action,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            message=f"{entity_type} failed: {entity_name}",
            error_message=error_message,
            event_duration=duration_ns,
            trace_id=trace_id,
            process_id=process_id,
        )
    elif end == _RunEnd.CANCELLED:
        logger.info(
            action=action,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.API,
            message=f"{entity_type} cancelled: {entity_name}",
            event_duration=duration_ns,
            trace_id=trace_id,
            process_id=process_id,
        )
    else:
        logger.info(
            action=action,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            message=f"{entity_type} completed: {entity_name}",
            event_duration=duration_ns,
            trace_id=trace_id,
            process_id=process_id,
        )


async def _with_logging(
    coro: Awaitable[T],
    logger: EventLogger,
    info: ActivityInfo | WorkflowInfo,
) -> T:
    """Execute a coroutine with start/end logging."""
    if isinstance(info, ActivityInfo):
        action = TemporalEventAction.ACTIVITY_EXECUTE
        entity_type, entity_name = "Activity", info.activity_type
        trace_id, process_id = info.workflow_id, info.activity_id
    elif isinstance(info, WorkflowInfo):
        action = TemporalEventAction.WORKFLOW_EXECUTE
        entity_type, entity_name = "Workflow", info.workflow_type
        trace_id, process_id = info.workflow_id, info.run_id
    else:
        raise ValueError(f"Invalid info type: {type(info)}")

    if not _is_workflow_replay(info):
        logger.info(
            action=action,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.API,
            message=f"{entity_type} started: {entity_name}",
            trace_id=trace_id,
            process_id=process_id,
        )

    start_time = time.perf_counter_ns()
    end = _RunEnd.COMPLETED
    error_message = ""

    try:
        return await coro
    except asyncio.CancelledError as e:
        end = _RunEnd.CANCELLED if _ends_cancelled(e, info) else _RunEnd.FAILED
        error_message = str(e) or type(e).__name__
        raise
    except ApplicationError as e:
        end, error_message = _RunEnd.FAILED, str(e)
        raise
    except Exception as e:
        # Wrapping a cancellation in an ApplicationError would end a user abort as FAILED.
        if _ends_cancelled(e, info):
            end = _RunEnd.CANCELLED
            raise
        end, error_message = _RunEnd.FAILED, str(e)
        if isinstance(info, WorkflowInfo):
            raise ApplicationError(
                f"{entity_type} '{entity_name}' failed: {error_message}",
                non_retryable=True,
            ) from e
        raise
    finally:
        # A cache eviction counts as replay: the SDK stops the run here and the next workflow
        # task re-runs it, so this is not its end.
        if not _is_workflow_replay(info):
            _log_end(
                logger,
                end,
                action,
                entity_type,
                entity_name,
                error_message=error_message,
                duration_ns=time.perf_counter_ns() - start_time,
                trace_id=trace_id,
                process_id=process_id,
            )


class LoggingActivityInboundInterceptor(ActivityInboundInterceptor):
    def __init__(
        self,
        next_interceptor: ActivityInboundInterceptor,
        logger: EventLogger,
    ) -> None:
        super().__init__(next_interceptor)
        self._logger = logger

    async def execute_activity(self, input: ExecuteActivityInput) -> Any:
        return await _with_logging(
            self.next.execute_activity(input), self._logger, activity.info()
        )


def _create_workflow_interceptor(
    logger: EventLogger,
) -> Type[WorkflowInboundInterceptor]:
    """Create a workflow interceptor class with logging."""

    class _Interceptor(WorkflowInboundInterceptor):
        async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:
            return await _with_logging(
                self.next.execute_workflow(input), logger, workflow.info()
            )

    return _Interceptor


class LoggingInterceptor(Interceptor):
    """Temporal worker interceptor that provides structured ECS logging.

    This interceptor automatically:
    - Logs workflow and activity start/end with duration and outcome
    - Wraps unhandled workflow exceptions in ApplicationError, except Temporal cancellations
    """

    def __init__(self, service_name: str, env: Environment) -> None:
        self._logger = EventLogger(
            service_name=service_name, settings=LoggingSettings(ENV=env)
        )
        self._workflow_class = _create_workflow_interceptor(self._logger)

    def intercept_activity(
        self, next: ActivityInboundInterceptor
    ) -> ActivityInboundInterceptor:
        return LoggingActivityInboundInterceptor(next, self._logger)

    def workflow_interceptor_class(
        self, input: WorkflowInterceptorClassInput
    ) -> Type[WorkflowInboundInterceptor]:
        return self._workflow_class
