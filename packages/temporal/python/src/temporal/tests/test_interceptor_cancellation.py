"""A user abort must end a run as cancelled, not as failed or completed (#197)."""

import asyncio
import contextlib
import dataclasses
import uuid
from collections.abc import Callable, Sequence
from datetime import timedelta
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, Mock

import pytest
from event_logging.enums import EventOutcome
from event_logging.settings import Environment
from temporal.contracts import WorkflowStatusEvent
from temporal.interceptors import logging_interceptor
from temporal.interceptors.logging_interceptor import LoggingInterceptor, _with_logging
from temporal.interceptors.workflow_tracking_interceptor import _TRACKING_PATCH_ID, WorkflowTrackingWorkerInterceptor
from temporalio import activity, workflow
from temporalio.activity import ActivityCancellationDetails
from temporalio.activity import Info as ActivityInfo
from temporalio.api.enums.v1 import EventType
from temporalio.client import Client, WorkflowExecutionStatus, WorkflowHandle, WorkflowHistory
from temporalio.exceptions import ApplicationError
from temporalio.testing import ActivityEnvironment, WorkflowEnvironment
from temporalio.worker import Interceptor, PatchActivationInput, Replayer, UnsandboxedWorkflowRunner, Worker
from temporalio.workflow import Info as WorkflowInfo

pytestmark = [pytest.mark.asyncio, pytest.mark.timeout(120)]

FIXTURES = Path(__file__).parent / "fixtures"


class _Recording:
    def __init__(self) -> None:
        self.posted_statuses: list[str] = []
        self.body_runs: list[str] = []
        self.block_running_notification = False
        self.fail_final_post = False
        self.released = False

    def reset(self) -> None:
        self.posted_statuses.clear()
        self.body_runs.clear()
        self.block_running_notification = False
        self.fail_final_post = False
        self.released = False


recording = _Recording()


@activity.defn(name="_post_status_activity")
async def record_status(event: WorkflowStatusEvent) -> None:
    status = str(getattr(event.status, "value", event.status))
    recording.posted_statuses.append(status)
    if recording.fail_final_post and status != "running":
        raise ApplicationError("tracking unavailable", non_retryable=True)
    while recording.block_running_notification and status == "running":
        activity.heartbeat()
        await asyncio.sleep(0.1)


@activity.defn(name="block_until_cancelled")
async def block_until_cancelled() -> None:
    recording.body_runs.append("started")
    while True:
        activity.heartbeat()
        await asyncio.sleep(0.1)


@activity.defn(name="wait_for_release")
async def wait_for_release() -> None:
    recording.body_runs.append("waiting")
    while not recording.released:
        await asyncio.sleep(0.05)


@workflow.defn(name="BlockingWorkflow")
class BlockingWorkflow:
    @workflow.run
    async def run(self) -> None:
        await workflow.execute_activity(
            block_until_cancelled,
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=2),
        )


@workflow.defn(name="SleepingWorkflow")
class SleepingWorkflow:
    @workflow.run
    async def run(self) -> None:
        await workflow.sleep(timedelta(minutes=5))


@workflow.defn(name="SelfCancellingWorkflow")
class SelfCancellingWorkflow:
    """Cancels its own activity; nobody cancels the run, so Temporal fails it."""

    @workflow.run
    async def run(self) -> None:
        handle = workflow.start_activity(
            block_until_cancelled,
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=2),
        )
        await workflow.sleep(timedelta(seconds=1))
        handle.cancel()
        await handle


@workflow.defn(name="InnerCancelWorkflow")
class InnerCancelWorkflow:
    """Cancels one of its own asyncio tasks; nobody cancels the run, so Temporal fails it."""

    @workflow.run
    async def run(self) -> None:
        timer = asyncio.create_task(workflow.sleep(timedelta(minutes=5)))
        await workflow.sleep(timedelta(milliseconds=100))
        timer.cancel()
        await timer


@workflow.defn(name="WaitingWorkflow")
class WaitingWorkflow:
    def __init__(self) -> None:
        self._finished = False

    @workflow.signal
    def finish(self) -> None:
        self._finished = True

    @workflow.run
    async def run(self) -> None:
        await workflow.wait_condition(lambda: self._finished)


@workflow.defn(name="ActivityWaitingWorkflow")
class ActivityWaitingWorkflow:
    @workflow.run
    async def run(self) -> None:
        await workflow.execute_activity(wait_for_release, start_to_close_timeout=timedelta(minutes=1))


@workflow.defn(name="CancelCleanupWorkflow")
class CancelCleanupWorkflow:
    """Accepts an abort, then waits for a signal before it completes."""

    def __init__(self) -> None:
        self._finished = False

    @workflow.signal
    def finish(self) -> None:
        self._finished = True

    @workflow.run
    async def run(self) -> None:
        try:
            await workflow.wait_condition(lambda: False)
        except asyncio.CancelledError:
            if workflow.cancellation_reason() is None:
                raise
        await workflow.wait_condition(lambda: self._finished)


@pytest.fixture(autouse=True)
def _reset_recording() -> None:
    recording.reset()


@pytest.fixture
def event_logger(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    logger = MagicMock()
    monkeypatch.setattr(logging_interceptor, "EventLogger", lambda **_: logger)
    return logger


async def _wait_until(condition: Callable[[], bool], timeout: float = 10.0) -> None:
    async with asyncio.timeout(timeout):
        while not condition():
            await asyncio.sleep(0.05)


async def _closed_status(handle: WorkflowHandle[Any, Any], timeout: float = 10.0) -> WorkflowExecutionStatus | None:
    status = (await handle.describe()).status
    with contextlib.suppress(TimeoutError):
        async with asyncio.timeout(timeout):
            while status == WorkflowExecutionStatus.RUNNING:
                await asyncio.sleep(0.1)
                status = (await handle.describe()).status
    return status


def _worker(
    client: Client,
    task_queue: str,
    interceptors: Sequence[Interceptor],
    max_cached_workflows: int = 1000,
    patch_activation_callback: Callable[[PatchActivationInput], bool] | None = None,
) -> Worker:
    return Worker(
        client,
        task_queue=task_queue,
        workflows=[
            BlockingWorkflow,
            SleepingWorkflow,
            SelfCancellingWorkflow,
            InnerCancelWorkflow,
            WaitingWorkflow,
            ActivityWaitingWorkflow,
            CancelCleanupWorkflow,
        ],
        activities=[block_until_cancelled, record_status, wait_for_release],
        interceptors=interceptors,
        workflow_runner=UnsandboxedWorkflowRunner(),
        max_cached_workflows=max_cached_workflows,
        patch_activation_callback=patch_activation_callback,
    )


async def _cancel_blocking_run(
    interceptors: Sequence[Interceptor],
    cancel_when: Callable[[], bool],
    patch_activation_callback: Callable[[PatchActivationInput], bool] | None = None,
) -> WorkflowExecutionStatus | None:
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, interceptors, patch_activation_callback=patch_activation_callback):
            handle = await env.client.start_workflow(
                BlockingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            await _wait_until(cancel_when)
            await handle.cancel()
            return await _closed_status(handle)


async def _wait_for_workflow_tasks(handle: WorkflowHandle[Any, Any], count: int) -> None:
    async with asyncio.timeout(10):
        while True:
            event_types = [event.event_type async for event in handle.fetch_history_events()]
            if event_types.count(EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED) >= count:
                return
            await asyncio.sleep(0.05)


async def _wait_for_event(handle: WorkflowHandle[Any, Any], event_type: EventType.ValueType) -> None:
    async with asyncio.timeout(10):
        while not any([event.event_type == event_type async for event in handle.fetch_history_events()]):
            await asyncio.sleep(0.05)


def _body_started() -> bool:
    return recording.body_runs == ["started"]


def _logging() -> LoggingInterceptor:
    return LoggingInterceptor(service_name="test", env=Environment.DEVELOPMENT)


def _workflow_messages(logger: MagicMock, workflow_type: str) -> list[str]:
    messages = [c.kwargs.get("message", "") for c in logger.method_calls]
    return [m for m in messages if m.startswith("Workflow") and m.endswith(f": {workflow_type}")]


async def test_logging_interceptor_keeps_an_abort_cancelled() -> None:
    assert await _cancel_blocking_run([_logging()], _body_started) == WorkflowExecutionStatus.CANCELED


async def test_tracking_reports_an_abort_during_an_activity_as_cancelled() -> None:
    status = await _cancel_blocking_run([WorkflowTrackingWorkerInterceptor()], _body_started)

    assert status == WorkflowExecutionStatus.CANCELED
    assert recording.posted_statuses[-1] == "cancelled"


async def test_tracking_passes_an_abort_during_the_running_notification_through() -> None:
    recording.block_running_notification = True

    status = await _cancel_blocking_run(
        [WorkflowTrackingWorkerInterceptor()], lambda: recording.posted_statuses == ["running"]
    )

    assert status == WorkflowExecutionStatus.CANCELED
    assert recording.body_runs == []
    assert recording.posted_statuses[-1] == "cancelled"


async def test_tracking_reports_an_abort_before_the_first_workflow_task_as_cancelled() -> None:
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        handle = await env.client.start_workflow(BlockingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue)
        await handle.cancel()
        async with _worker(env.client, task_queue, [_logging(), WorkflowTrackingWorkerInterceptor()]):
            status = await _closed_status(handle)

    assert status == WorkflowExecutionStatus.CANCELED
    assert recording.body_runs == []
    assert recording.posted_statuses[-1] == "cancelled"


async def test_production_interceptor_order_keeps_an_abort_cancelled() -> None:
    status = await _cancel_blocking_run([_logging(), WorkflowTrackingWorkerInterceptor()], _body_started)

    assert status == WorkflowExecutionStatus.CANCELED
    assert recording.posted_statuses[-1] == "cancelled"


async def test_a_run_aborted_with_the_fix_replays() -> None:
    # Another worker with this fix must be able to continue the run or answer queries on it.
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, [_logging(), WorkflowTrackingWorkerInterceptor()]):
            handle = await env.client.start_workflow(
                BlockingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            await _wait_until(_body_started)
            await handle.cancel()
            assert await _closed_status(handle) == WorkflowExecutionStatus.CANCELED
        history = await handle.fetch_history()

    patches = [
        payload.data.decode()
        for e in history.events
        if e.event_type == EventType.EVENT_TYPE_MARKER_RECORDED
        for payload in e.marker_recorded_event_attributes.details["patch-data"].payloads
    ]
    assert any('"cancel-passthrough"' in patch for patch in patches)
    await Replayer(
        workflows=[BlockingWorkflow],
        interceptors=[_logging(), WorkflowTrackingWorkerInterceptor()],
        workflow_runner=UnsandboxedWorkflowRunner(),
    ).replay_workflow(history)


async def test_tracking_and_logging_agree_on_an_abort_without_the_passthrough() -> None:
    # A run that handled the abort before the fix was deployed reports a failure on both sides, also
    # when the other interceptor decides on a newer worker.
    status = await _cancel_blocking_run(
        [_logging(), WorkflowTrackingWorkerInterceptor()],
        _body_started,
        patch_activation_callback=lambda patch: patch.patch_id == _TRACKING_PATCH_ID,
    )

    assert status == WorkflowExecutionStatus.FAILED
    assert recording.posted_statuses[-1] == "failed"


async def test_tracking_and_logging_report_an_abort_during_a_timer_as_cancelled_without_the_passthrough(
    event_logger: MagicMock,
) -> None:
    # The SDK ends a bare cancellation after an abort as CANCELED whatever the patch says, and logging
    # never wrapped it, so both interceptors must report it as cancelled on any worker.
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(
            env.client,
            task_queue,
            [_logging(), WorkflowTrackingWorkerInterceptor()],
            patch_activation_callback=lambda patch: patch.patch_id == _TRACKING_PATCH_ID,
        ):
            handle = await env.client.start_workflow(
                SleepingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            await _wait_for_event(handle, EventType.EVENT_TYPE_TIMER_STARTED)
            await handle.cancel()
            status = await _closed_status(handle)

    assert status == WorkflowExecutionStatus.CANCELED
    assert recording.posted_statuses[-1] == "cancelled"
    assert _workflow_messages(event_logger, "SleepingWorkflow")[-1] == "Workflow cancelled: SleepingWorkflow"


async def test_a_failed_final_post_is_logged_as_such(caplog: pytest.LogCaptureFixture) -> None:
    recording.fail_final_post = True
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, [WorkflowTrackingWorkerInterceptor()]):
            handle = await env.client.start_workflow(
                WaitingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            await handle.signal(WaitingWorkflow.finish)
            async with asyncio.timeout(10):
                await handle.result()

    messages = [record.getMessage() for record in caplog.records]
    assert any(message.startswith("failed to post final status") for message in messages)
    assert not any(message.startswith("failed to schedule running notification") for message in messages)


async def test_a_self_cancelled_activity_is_reported_as_a_failure(event_logger: MagicMock) -> None:
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, [_logging(), WorkflowTrackingWorkerInterceptor()]):
            handle = await env.client.start_workflow(
                SelfCancellingWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            status = await _closed_status(handle)

    assert status == WorkflowExecutionStatus.FAILED
    assert recording.posted_statuses[-1] == "failed"
    assert _workflow_messages(event_logger, "SelfCancellingWorkflow")[-1] == "Workflow failed: SelfCancellingWorkflow"


async def test_a_cancelled_inner_task_is_reported_as_a_failure(event_logger: MagicMock) -> None:
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, [_logging(), WorkflowTrackingWorkerInterceptor()]):
            handle = await env.client.start_workflow(
                InnerCancelWorkflow.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue
            )
            status = await _closed_status(handle)

    final_log = [c for c in event_logger.method_calls if c.kwargs.get("message", "").startswith("Workflow")][-1]
    assert status == WorkflowExecutionStatus.FAILED
    assert recording.posted_statuses[-1] == "failed"
    assert final_log.kwargs["message"] == "Workflow failed: InnerCancelWorkflow"
    assert final_log.kwargs["error_message"] == "CancelledError"


async def _finish_after_eviction(handle: WorkflowHandle[Any, Any]) -> None:
    await _wait_for_workflow_tasks(handle, 1)
    await handle.signal(WaitingWorkflow.finish)


async def _release_after_eviction(handle: WorkflowHandle[Any, Any]) -> None:
    await _wait_until(lambda: recording.body_runs == ["waiting"])
    recording.released = True


async def _cancel_then_finish_after_eviction(handle: WorkflowHandle[Any, Any]) -> None:
    await _wait_for_workflow_tasks(handle, 1)
    await handle.cancel()
    await _wait_for_workflow_tasks(handle, 2)
    await handle.signal(CancelCleanupWorkflow.finish)


@pytest.mark.parametrize(
    ("workflow_class", "interceptors", "drive"),
    [
        pytest.param(WaitingWorkflow, lambda: [_logging()], _finish_after_eviction, id="waiting-on-a-condition"),
        pytest.param(
            ActivityWaitingWorkflow,
            lambda: [_logging(), WorkflowTrackingWorkerInterceptor()],
            _release_after_eviction,
            id="waiting-on-an-activity",
        ),
        pytest.param(
            CancelCleanupWorkflow,
            lambda: [_logging()],
            _cancel_then_finish_after_eviction,
            id="cleaning-up-after-an-abort",
        ),
    ],
)
async def test_a_cache_eviction_logs_neither_an_end_nor_a_second_start(
    event_logger: MagicMock,
    workflow_class: Any,
    interceptors: Callable[[], Sequence[Interceptor]],
    drive: Callable[[WorkflowHandle[Any, Any]], Any],
) -> None:
    # Without a cache, the worker evicts the run after every workflow task and replays it on the next.
    async with await WorkflowEnvironment.start_local() as env:
        task_queue = f"tq-{uuid.uuid4()}"
        async with _worker(env.client, task_queue, interceptors(), max_cached_workflows=0):
            handle = await env.client.start_workflow(workflow_class.run, id=f"wf-{uuid.uuid4()}", task_queue=task_queue)
            await drive(handle)
            async with asyncio.timeout(10):
                await handle.result()

    name = workflow_class.__name__
    assert _workflow_messages(event_logger, name) == [f"Workflow started: {name}", f"Workflow completed: {name}"]


@pytest.mark.parametrize(
    ("fixture", "interceptors"),
    [
        ("tracking_abort_during_running_notification_before_fix.json", lambda: [WorkflowTrackingWorkerInterceptor()]),
        ("logging_abort_during_activity_before_fix.json", lambda: [_logging()]),
        ("tracking_abort_before_running_notification_before_fix.json", lambda: [WorkflowTrackingWorkerInterceptor()]),
        (
            "production_order_abort_before_running_notification_before_fix.json",
            lambda: [_logging(), WorkflowTrackingWorkerInterceptor()],
        ),
    ],
)
async def test_runs_recorded_before_the_fix_still_replay(
    fixture: str, interceptors: Callable[[], Sequence[Interceptor]]
) -> None:
    # The histories were recorded with the interceptors as they were before #197, so
    # workers with this fix can continue open runs and answer queries on closed ones.
    history = WorkflowHistory.from_json(f"fixture-{Path(fixture).stem}", (FIXTURES / fixture).read_text())

    await Replayer(
        workflows=[BlockingWorkflow],
        interceptors=interceptors(),
        workflow_runner=UnsandboxedWorkflowRunner(),
    ).replay_workflow(history)


def _activity_info() -> ActivityInfo:
    info = Mock(spec=ActivityInfo)
    info.activity_type, info.workflow_id, info.activity_id = "activity", "workflow", "1"
    return info


async def test_logging_records_an_application_error_as_failure() -> None:
    logger = MagicMock()

    async def fail() -> None:
        raise ApplicationError("boom")

    with pytest.raises(ApplicationError):
        await _with_logging(fail(), logger, _activity_info())

    assert logger.method_calls[-1].kwargs["outcome"] == EventOutcome.FAILURE


@pytest.mark.parametrize(
    ("details", "message"),
    [
        (ActivityCancellationDetails(cancel_requested=True), "Activity cancelled: activity"),
        (ActivityCancellationDetails(worker_shutdown=True), "Activity cancelled: activity"),
        # The SDK completes a paused or reset activity's unhandled cancel as a failure.
        (ActivityCancellationDetails(paused=True), "Activity failed: activity"),
        (ActivityCancellationDetails(reset=True), "Activity failed: activity"),
        # A heartbeat response can carry several flags; a pause or reset still wins.
        (ActivityCancellationDetails(cancel_requested=True, paused=True), "Activity failed: activity"),
        (ActivityCancellationDetails(cancel_requested=True, reset=True), "Activity failed: activity"),
        (ActivityCancellationDetails(worker_shutdown=True, paused=True), "Activity failed: activity"),
        (ActivityCancellationDetails(not_found=True, timed_out=True), "Activity failed: activity"),
    ],
)
async def test_logging_reports_a_cancelled_activity_as_the_sdk_ends_it(
    details: ActivityCancellationDetails, message: str
) -> None:
    logger = MagicMock()
    env = ActivityEnvironment()
    env.info = dataclasses.replace(env.info, activity_type="activity")
    started = asyncio.Event()

    async def body() -> None:
        started.set()
        await asyncio.Event().wait()

    async def run() -> None:
        await _with_logging(body(), logger, activity.info())

    task = asyncio.create_task(env.run(run))
    await started.wait()
    env.cancel(cancellation_details=details)
    with pytest.raises(asyncio.CancelledError):
        await task

    final_log = logger.method_calls[-1]
    assert final_log.kwargs["message"] == message
    assert final_log.kwargs["outcome"] != EventOutcome.SUCCESS


class _Suspend:
    def __await__(self) -> Any:
        yield


async def test_logging_ends_quietly_when_a_left_behind_run_is_closed_after_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A worker that shuts down leaves running workflow coroutines behind; Python closes them later,
    # outside the workflow event loop, where the run has not ended and nothing must be logged.
    logger = MagicMock()
    info = Mock(spec=WorkflowInfo)
    info.workflow_type, info.workflow_id, info.run_id = "Workflow", "workflow", "run"
    monkeypatch.setattr(workflow, "in_workflow", lambda: True)
    monkeypatch.setattr(workflow.unsafe, "is_replaying", lambda: False)

    run = _with_logging(_Suspend(), logger, info)
    run.send(None)
    monkeypatch.undo()
    run.close()

    assert [c.kwargs["message"] for c in logger.method_calls] == ["Workflow started: Workflow"]
