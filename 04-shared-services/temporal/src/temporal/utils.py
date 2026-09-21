import asyncio
from collections.abc import Awaitable, Callable
from contextlib import nullcontext
from datetime import timedelta
from typing import Any, NewType, TypeVar
from uuid import UUID

from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.common import (
    Priority,
    WorkflowIDConflictPolicy,
    WorkflowIDReusePolicy,
)
from temporalio.exceptions import TemporalError
from temporalio.workflow import ChildWorkflowHandle
from ulid import ULID

from temporal.observability import traced
from temporal.project_context import (
    merge_project_search_attributes,
    project_scoped_workflow_id,
    resolve_project_context,
    use_project_context,
)
from temporal.worker import get_temporal_client

WorkflowName = NewType("WorkflowName", str)
WorkflowReference = WorkflowName | Callable[..., Awaitable[Any]]


def _workflow_name(workflow_ref: WorkflowReference) -> str:
    if isinstance(workflow_ref, str):
        return workflow_ref
    return workflow_ref.__qualname__.removesuffix(".run")


def is_in_workflow() -> bool:
    try:
        workflow.info()
        return True
    except (RuntimeError, TemporalError):
        return False


@traced
async def execute_workflow(
    workflow_id: WorkflowReference,
    input: Any,
    task_queue: str,
    project_id: str | None = None,
    project_version: int | None = None,
    id_reuse_policy: WorkflowIDReusePolicy = WorkflowIDReusePolicy.ALLOW_DUPLICATE,
    id_conflict_policy: WorkflowIDConflictPolicy = WorkflowIDConflictPolicy.UNSPECIFIED,
    task_timeout: timedelta = timedelta(seconds=60),
    priority: Priority | None = None,
) -> Any:
    resolved_project_id, resolved_project_version = resolve_project_context(project_id, project_version)
    search_attributes = merge_project_search_attributes(
        None,
        project_id=resolved_project_id,
        project_version=resolved_project_version,
    )
    if is_in_workflow():
        return await workflow.execute_child_workflow(
            workflow_id,
            input,
            id=str(workflow.uuid4()),
            task_queue=task_queue,
            search_attributes=search_attributes,
            id_reuse_policy=id_reuse_policy,
            task_timeout=task_timeout,
            priority=priority,
        )
    execution_id = (
        project_scoped_workflow_id(_workflow_name(workflow_id), resolved_project_id, resolved_project_version)
        if resolved_project_id
        else str(workflow.uuid4())
    )
    client = await get_temporal_client()
    return await client.execute_workflow(
        workflow_id,
        input,
        id=execution_id,
        task_queue=task_queue,
        search_attributes=search_attributes,
        id_reuse_policy=id_reuse_policy,
        id_conflict_policy=id_conflict_policy,
        task_timeout=task_timeout,
        priority=priority,
    )


@traced
async def start_workflow(
    workflow_id: WorkflowReference,
    input: Any,
    task_queue: str,
    project_id: str | UUID | None = None,
    project_version: int | None = None,
    id_reuse_policy: WorkflowIDReusePolicy = WorkflowIDReusePolicy.ALLOW_DUPLICATE,
    id_conflict_policy: WorkflowIDConflictPolicy = WorkflowIDConflictPolicy.UNSPECIFIED,
    task_timeout: timedelta = timedelta(seconds=60),
    parent_close_policy: workflow.ParentClosePolicy = workflow.ParentClosePolicy.TERMINATE,
    _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID: str | None = None,  # noqa: N803
    priority: Priority | None = None,
) -> WorkflowHandle[Any, Any] | ChildWorkflowHandle[Any, Any]:
    resolved_project_id, resolved_project_version = resolve_project_context(project_id, project_version)
    search_attributes = merge_project_search_attributes(
        None,
        project_id=resolved_project_id,
        project_version=resolved_project_version,
    )
    if is_in_workflow():
        return await workflow.start_child_workflow(
            workflow_id,
            input,
            id=str(workflow.uuid4()),
            task_queue=task_queue,
            search_attributes=search_attributes,
            id_reuse_policy=id_reuse_policy,
            task_timeout=task_timeout,
            parent_close_policy=parent_close_policy,
            priority=priority,
        )
    execution_id = (
        project_scoped_workflow_id(_workflow_name(workflow_id), resolved_project_id, resolved_project_version)
        if resolved_project_id
        else str(ULID())
    )
    client = await get_temporal_client()
    context = (
        use_project_context(resolved_project_id, resolved_project_version)
        if resolved_project_id is not None and resolved_project_version is not None
        else nullcontext()
    )
    with context:
        return await client.start_workflow(
            workflow_id,
            input,
            id=_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID
            if _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID
            else str(execution_id),
            task_queue=task_queue,
            search_attributes=search_attributes,
            id_reuse_policy=id_reuse_policy,
            id_conflict_policy=id_conflict_policy,
            task_timeout=task_timeout,
            priority=priority,
        )


@traced
async def stop_workflow(workflow_id: str) -> None:
    client = await get_temporal_client()
    await client.get_workflow_handle(workflow_id).cancel()


T = TypeVar("T")
R = TypeVar("R")


async def await_with_heartbeat(  # noqa: UP047
    awaitable: Awaitable[T],
    interval: float = 30,
    detail: str | None = None,
) -> T:
    """Await a long-running coroutine while sending activity heartbeats.

    Must be called from inside a Temporal activity.

    Args:
        awaitable: The coroutine to await (e.g. ``handle.result()``).
        interval: Seconds between heartbeats (default 30).
        detail: Optional detail string sent with each heartbeat.
    """
    from temporalio import activity

    async def _heartbeat_loop() -> None:
        while True:
            try:
                activity.heartbeat(detail)
            except Exception:
                return
            await asyncio.sleep(interval)

    heartbeat_task = asyncio.create_task(_heartbeat_loop())
    try:
        return await awaitable
    finally:
        heartbeat_task.cancel()


async def sliding_window(
    items: list[T],
    fn: Callable[[T], Awaitable[R]],
    concurrency: int,
) -> list[R]:
    """Process *items* through *fn* with a sliding concurrency window.

    Keeps *concurrency* tasks in flight at all times.  When one finishes the
    next item is immediately started — no fixed-batch idle time.
    """
    if not items:
        return []

    ok: list[R] = []
    in_flight: dict[asyncio.Task[R], T] = {}
    next_i = 0
    scheduled_since_flush = 0

    async def schedule_one() -> None:
        nonlocal next_i, scheduled_since_flush
        task = asyncio.ensure_future(fn(items[next_i]))
        in_flight[task] = items[next_i]
        next_i += 1
        scheduled_since_flush += 1

        # force framework flush every 30 schedules
        if scheduled_since_flush >= 30:
            scheduled_since_flush = 0
            await asyncio.sleep(1)

    # initial fill
    while next_i < len(items) and len(in_flight) < concurrency:
        await schedule_one()

    while in_flight:
        done, _ = await workflow.wait(
            in_flight.keys(),
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            in_flight.pop(task)
            ok.append(task.result())

        # refill window
        while next_i < len(items) and len(in_flight) < concurrency:
            await schedule_one()

    return ok
