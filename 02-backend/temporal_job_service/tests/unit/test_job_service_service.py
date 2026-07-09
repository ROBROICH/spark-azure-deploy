"""Unit tests for job service workflow querying."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from temporalio.api.enums.v1.event_type_pb2 import EventType

from src.models.schemas.job_service_schemas import (
    ChildWorkflowInfo,
    ExecutionStatus,
    WorkflowsByTypeQuery,
)
from src.services.job_service_service import JobServiceService

CHILD_TERMINAL_EVENT_ATTRIBUTE_NAMES = {
    EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED: ("child_workflow_execution_completed_event_attributes"),
    EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_FAILED: ("child_workflow_execution_failed_event_attributes"),
    EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_CANCELED: ("child_workflow_execution_canceled_event_attributes"),
    EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TIMED_OUT: ("child_workflow_execution_timed_out_event_attributes"),
    EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TERMINATED: ("child_workflow_execution_terminated_event_attributes"),
}


class FakeTemporalClient:
    def __init__(self, responses_by_query=None) -> None:
        self.queries: list[str] = []
        self.responses_by_query = responses_by_query or {}

    async def _iter_workflows(self, items):
        for item in items:
            yield item

    def list_workflows(self, query: str):
        self.queries.append(query)
        return self._iter_workflows(self.responses_by_query.get(query, []))


class FakeTemporalHandle:
    def __init__(self, history) -> None:
        self.history = history

    async def fetch_history(self):
        return self.history


class FakeTemporalDescriptionHandle:
    def __init__(self, search_attributes) -> None:
        self.search_attributes = search_attributes

    async def describe(self):
        return SimpleNamespace(search_attributes=self.search_attributes)


class FakeTemporalHistoryClient:
    def __init__(self, history) -> None:
        self.history = history
        self.handle_requests: list[tuple[str, str | None]] = []

    def get_workflow_handle(self, workflow_id: str, run_id: str | None = None):
        self.handle_requests.append((workflow_id, run_id))
        return FakeTemporalHandle(self.history)


class FakeTemporalDescriptionClient:
    def __init__(self, search_attributes) -> None:
        self.search_attributes = search_attributes
        self.handle_requests: list[tuple[str, str | None]] = []

    def get_workflow_handle(self, workflow_id: str, run_id: str | None = None):
        self.handle_requests.append((workflow_id, run_id))
        return FakeTemporalDescriptionHandle(self.search_attributes)


def make_workflow(
    workflow_id: str,
    workflow_type: str,
    *,
    run_id: str = "run-1",
    status_name: str = "COMPLETED",
    project_id: str | None = None,
    project_version: int | None = None,
):
    search_attributes = {}
    if project_id:
        search_attributes["ProjectId"] = [project_id]
    if project_version is not None:
        search_attributes["ProjectVersion"] = [project_version]
    return SimpleNamespace(
        id=workflow_id,
        run_id=run_id,
        search_attributes=search_attributes or None,
        workflow_type=workflow_type,
        status=SimpleNamespace(name=status_name),
        start_time=datetime(2026, 4, 15, 9, 0, tzinfo=UTC),
        close_time=datetime(2026, 4, 15, 9, 5, tzinfo=UTC),
    )


@pytest.mark.asyncio
async def test_get_workflow_project_id_reads_project_search_attribute() -> None:
    project_id = str(uuid4())
    temporal_client = FakeTemporalDescriptionClient({"ProjectId": [project_id]})

    result = await JobServiceService.get_workflow_project_id(
        "wf-1",
        temporal_client,  # type: ignore[arg-type]
    )

    assert result == project_id
    assert temporal_client.handle_requests == [("wf-1", None)]


def make_child_history(
    *,
    child_workflow_id: str,
    child_workflow_type: str,
    terminal_event_type: EventType = (EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED),
    terminal_event_attributes: SimpleNamespace | None = None,
):
    terminal_attribute_name = CHILD_TERMINAL_EVENT_ATTRIBUTE_NAMES[terminal_event_type]
    terminal_attributes = terminal_event_attributes or SimpleNamespace(initiated_event_id=1)

    return SimpleNamespace(
        events=[
            SimpleNamespace(
                event_id=1,
                event_type=EventType.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED,
                start_child_workflow_execution_initiated_event_attributes=SimpleNamespace(
                    workflow_id=child_workflow_id,
                    workflow_type=SimpleNamespace(name=child_workflow_type),
                ),
            ),
            SimpleNamespace(
                event_id=2,
                event_type=EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED,
                child_workflow_execution_started_event_attributes=SimpleNamespace(initiated_event_id=1),
            ),
            SimpleNamespace(
                event_id=3,
                event_type=terminal_event_type,
                **{terminal_attribute_name: terminal_attributes},
            ),
        ]
    )


@pytest.mark.asyncio
async def test_get_workflows_filters_out_child_workflows() -> None:
    temporal_client = FakeTemporalClient()
    project_id = uuid4()

    response = await JobServiceService.get_workflows(
        execution_status=ExecutionStatus.ALL,
        project_id=project_id,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert temporal_client.queries == [f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}"']
    assert response.retrieved_workflows == 0


@pytest.mark.asyncio
async def test_get_workflows_combines_parent_filter_with_other_filters() -> None:
    temporal_client = FakeTemporalClient()
    project_id = uuid4()

    await JobServiceService.get_workflows(
        execution_status=ExecutionStatus.RUNNING,
        project_id=project_id,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert temporal_client.queries == [
        f'`ParentWorkflowId` IS null AND `ExecutionStatus` = "Running" AND `ProjectId` = "{project_id}"'
    ]


@pytest.mark.asyncio
async def test_get_workflows_filters_by_project_version_when_requested() -> None:
    temporal_client = FakeTemporalClient()
    project_id = uuid4()

    await JobServiceService.get_workflows(
        execution_status=ExecutionStatus.ALL,
        project_id=project_id,
        temporal_client=temporal_client,  # type: ignore[arg-type]
        project_version=3,
    )

    assert temporal_client.queries == [
        f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `ProjectVersion` = 3'
    ]


@pytest.mark.asyncio
async def test_get_workflows_by_type_builds_query() -> None:
    temporal_client = FakeTemporalClient()
    project_id = uuid4()

    response = await JobServiceService.get_workflows_by_type(
        project_id=project_id,
        workflow_type="BatchMVPWorkflow",
        include_children=False,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert temporal_client.queries == [
        f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `WorkflowType` = "BatchMVPWorkflow"',
    ]
    assert response.workflow_type == "BatchMVPWorkflow"
    assert response.retrieved_workflows == 0


@pytest.mark.asyncio
async def test_get_workflows_by_type_filters_by_project_version_when_requested() -> None:
    temporal_client = FakeTemporalClient()
    project_id = uuid4()

    response = await JobServiceService.get_workflows_by_type(
        project_id=project_id,
        workflow_type="FVPWorkflow",
        include_children=False,
        temporal_client=temporal_client,  # type: ignore[arg-type]
        project_version=2,
    )

    assert temporal_client.queries == [
        f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `WorkflowType` = "FVPWorkflow" AND `ProjectVersion` = 2',
    ]
    assert response.workflow_type == "FVPWorkflow"
    assert response.retrieved_workflows == 0


@pytest.mark.asyncio
async def test_get_workflows_by_type_does_not_fetch_children_when_not_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    query = f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `WorkflowType` = "BatchMVPWorkflow"'
    temporal_client = FakeTemporalClient(
        responses_by_query={
            query: [
                make_workflow(
                    "wf-1",
                    "BatchMVPWorkflow",
                    project_id=str(project_id),
                    project_version=7,
                )
            ]
        }
    )

    async def fail_if_called(*args, **kwargs):
        raise AssertionError("_get_immediate_children should not be called")

    monkeypatch.setattr(JobServiceService, "_get_immediate_children", staticmethod(fail_if_called))

    response = await JobServiceService.get_workflows_by_type(
        project_id=project_id,
        workflow_type="BatchMVPWorkflow",
        include_children=False,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert response.retrieved_workflows == 1
    assert response.workflows[0].workflow_id == "wf-1"
    assert response.workflows[0].project_version == 7
    assert response.workflows[0].children == []


@pytest.mark.asyncio
async def test_get_workflows_by_type_fetches_children_when_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    query = f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `WorkflowType` = "FVPWorkflow"'
    temporal_client = FakeTemporalClient(
        responses_by_query={query: [make_workflow("wf-1", "FVPWorkflow", run_id="run-42")]}
    )
    calls: list[tuple[str, str | None]] = []

    async def fake_get_immediate_children(client, workflow_id, run_id):
        calls.append((workflow_id, run_id))
        return [
            ChildWorkflowInfo(
                workflow_id="child-1",
                workflow_type="LLMMatchingWorkflow",
                status="completed",
            )
        ]

    monkeypatch.setattr(
        JobServiceService,
        "_get_immediate_children",
        staticmethod(fake_get_immediate_children),
    )

    response = await JobServiceService.get_workflows_by_type(
        project_id=project_id,
        workflow_type="FVPWorkflow",
        include_children=True,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert calls == [("wf-1", "run-42")]
    assert response.retrieved_workflows == 1
    assert response.workflows[0].children == [
        ChildWorkflowInfo(
            workflow_id="child-1",
            workflow_type="LLMMatchingWorkflow",
            status="completed",
        )
    ]


@pytest.mark.asyncio
async def test_get_workflows_by_type_keeps_missing_project_id_as_none() -> None:
    project_id = uuid4()
    query = f'`ParentWorkflowId` IS null AND `ProjectId` = "{project_id}" AND `WorkflowType` = "BatchMVPWorkflow"'
    temporal_client = FakeTemporalClient(responses_by_query={query: [make_workflow("wf-1", "BatchMVPWorkflow")]})

    response = await JobServiceService.get_workflows_by_type(
        project_id=project_id,
        workflow_type="BatchMVPWorkflow",
        include_children=False,
        temporal_client=temporal_client,  # type: ignore[arg-type]
    )

    assert response.retrieved_workflows == 1
    assert response.workflows[0].project_id is None


def test_workflows_by_type_query_rejects_blank_workflow_type() -> None:
    with pytest.raises(ValidationError) as exc_info:
        WorkflowsByTypeQuery(workflow_type="  ")

    assert exc_info.value.errors(include_url=False)[0]["type"] == "string_pattern_mismatch"


def test_workflows_by_type_query_rejects_query_breaking_characters() -> None:
    with pytest.raises(ValidationError) as exc_info:
        WorkflowsByTypeQuery(workflow_type='BatchMVPWorkflow" OR `ProjectId` = "other"')

    assert exc_info.value.errors(include_url=False)[0]["type"] == "string_pattern_mismatch"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    (
        "terminal_event_type",
        "terminal_event_attributes",
        "expected_status",
        "expected_error",
    ),
    [
        (
            EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED,
            SimpleNamespace(initiated_event_id=1),
            "completed",
            None,
        ),
        (
            EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_FAILED,
            SimpleNamespace(
                initiated_event_id=1,
                failure=SimpleNamespace(message="child failed"),
            ),
            "failed",
            "child failed",
        ),
        (
            EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_CANCELED,
            SimpleNamespace(initiated_event_id=1, details="cancelled by parent"),
            "failed",
            "cancelled by parent",
        ),
        (
            EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TIMED_OUT,
            SimpleNamespace(initiated_event_id=1),
            "failed",
            "Child workflow timed out",
        ),
        (
            EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TERMINATED,
            SimpleNamespace(initiated_event_id=1),
            "failed",
            "Child workflow terminated",
        ),
    ],
)
async def test_get_immediate_children_uses_run_id_and_maps_terminal_status(
    terminal_event_type: EventType,
    terminal_event_attributes: SimpleNamespace,
    expected_status: str,
    expected_error: str | None,
) -> None:
    history = make_child_history(
        child_workflow_id="child-1",
        child_workflow_type="MVPWorkflow",
        terminal_event_type=terminal_event_type,
        terminal_event_attributes=terminal_event_attributes,
    )
    temporal_client = FakeTemporalHistoryClient(history)

    response = await JobServiceService._get_immediate_children(
        temporal_client,
        "wf-1",
        "run-123",  # type: ignore[arg-type]
    )

    assert temporal_client.handle_requests == [("wf-1", "run-123")]
    assert response == [
        ChildWorkflowInfo(
            workflow_id="child-1",
            workflow_type="MVPWorkflow",
            status=expected_status,
            error=expected_error,
        )
    ]
    assert response[0].children == []
