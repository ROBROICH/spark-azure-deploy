from __future__ import annotations

import time
from enum import Enum
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

T = TypeVar("T")


class TemporalEventAction(str, Enum):
    WORKFLOW_EXECUTE = "workflow_execute"
    ACTIVITY_EXECUTE = "activity_execute"


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

    logger.info(
        action=action,
        outcome=EventOutcome.UNKNOWN,
        category=EventCategory.API,
        message=f"{entity_type} started: {entity_name}",
        trace_id=trace_id,
        process_id=process_id,
    )

    start_time = time.perf_counter_ns()
    error_message: str | None = None

    try:
        return await coro
    except ApplicationError:
        raise
    except Exception as e:
        error_message = str(e)
        if isinstance(info, WorkflowInfo):
            raise ApplicationError(
                f"{entity_type} '{entity_name}' failed: {error_message}",
                non_retryable=True,
            ) from e
        raise
    finally:
        duration_ns = time.perf_counter_ns() - start_time
        if error_message is not None:
            logger.error(
                action=action,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                message=f"{entity_type} failed: {entity_name}",
                event_duration=duration_ns,
                trace_id=trace_id,
                process_id=process_id,
                error_message=error_message,
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
    - Wraps unhandled workflow exceptions in ApplicationError
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
