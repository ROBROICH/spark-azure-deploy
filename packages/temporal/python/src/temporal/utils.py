import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any, TypeVar

from temporalio import workflow
from temporalio.common import (
    Priority,
    WorkflowIDReusePolicy,
)

from temporal.observability import traced
from temporal.project_context import (
    merge_project_search_attributes,
    resolve_project_context,
)
from temporal.registry import WorkflowDefinition

TEMPORAL_FLUSH_INTERVAL = 30


@traced
async def execute_child_workflow(
    definition: WorkflowDefinition,
    input: Any,
    project_id: str | None = None,
    project_version: int | None = None,
    id_reuse_policy: WorkflowIDReusePolicy = WorkflowIDReusePolicy.ALLOW_DUPLICATE,
    task_timeout: timedelta = timedelta(seconds=60),
    priority: Priority | None = None,
) -> Any:
    resolved_project_id, resolved_project_version = resolve_project_context(project_id, project_version)
    search_attributes = merge_project_search_attributes(
        None,
        project_id=resolved_project_id,
        project_version=resolved_project_version,
    )
    return await workflow.execute_child_workflow(
        definition.name,
        input,
        id=str(workflow.uuid4()),
        task_queue=definition.task_queue,
        search_attributes=search_attributes,
        id_reuse_policy=id_reuse_policy,
        task_timeout=task_timeout,
        priority=priority or Priority(),
    )


T = TypeVar("T")
R = TypeVar("R")


async def _run_sliding_window(
    items: list[T],
    fn: Callable[[T], Awaitable[R]],
    concurrency: int,
    *,
    flush_interval: int | None,
    collect_failures: bool,
) -> tuple[list[R], list[T]]:
    ok: list[R] = []
    failed: list[T] = []
    if not items:
        return ok, failed

    in_flight: dict[asyncio.Task[R], T] = {}
    next_i = 0
    scheduled_since_flush = 0

    async def schedule_one() -> None:
        nonlocal next_i, scheduled_since_flush
        task = asyncio.ensure_future(fn(items[next_i]))
        in_flight[task] = items[next_i]
        next_i += 1
        scheduled_since_flush += 1

        if flush_interval is not None and scheduled_since_flush >= flush_interval:
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
            item = in_flight.pop(task)
            try:
                ok.append(task.result())
            except Exception:
                if not collect_failures:
                    raise
                failed.append(item)

        # refill window
        while next_i < len(items) and len(in_flight) < concurrency:
            await schedule_one()

    return ok, failed


async def sliding_window(
    items: list[T],
    fn: Callable[[T], Awaitable[R]],
    concurrency: int,
) -> list[R]:
    ok, _ = await _run_sliding_window(
        items,
        fn,
        concurrency,
        flush_interval=TEMPORAL_FLUSH_INTERVAL,
        collect_failures=False,
    )
    return ok


async def sliding_window_collect_failures(
    items: list[T],
    fn: Callable[[T], Awaitable[R]],
    concurrency: int,
) -> tuple[list[R], list[T]]:
    return await _run_sliding_window(
        items,
        fn,
        concurrency,
        flush_interval=None,
        collect_failures=True,
    )
