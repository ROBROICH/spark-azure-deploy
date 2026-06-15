from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from temporal.activities.workflow_starts import (
    StartDecoupledParentWorkflowInput,
    start_decoupled_parent_workflow,
)
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
    use_project_context,
)
from temporal.utils import WorkflowName
from temporal.workflows.orchestrator.ewms import (
    EWMS_ORCHESTRATOR_TASK_QUEUE,
    EWMS_ORCHESTRATOR_WORKFLOW_ID,
    EWMSOrchestratorWorkflowInput,
)
from temporalio.common import WorkflowIDReusePolicy


@pytest.mark.asyncio
async def test_start_decoupled_parent_workflow_starts_workflow_from_activity(monkeypatch):
    project_id = uuid4()
    workflow_input = EWMSOrchestratorWorkflowInput(
        project_id=project_id,
        file_ids=[uuid4()],
    )
    handle = type("WorkflowHandle", (), {"id": "started-workflow-id"})()
    start = AsyncMock(return_value=handle)
    monkeypatch.setattr("temporal.activities.workflow_starts.start_workflow", start)

    result = await start_decoupled_parent_workflow(
        StartDecoupledParentWorkflowInput(
            workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
            workflow_input=workflow_input,
            task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
            project_id=project_id,
            project_version=4,
            task_timeout_seconds=30,
            id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
        )
    )

    assert result == "started-workflow-id"
    start.assert_awaited_once_with(
        workflow_id=WorkflowName(EWMS_ORCHESTRATOR_WORKFLOW_ID),
        input=workflow_input,
        task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
        project_id=project_id,
        project_version=4,
        task_timeout=timedelta(seconds=30),
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )


@pytest.mark.asyncio
async def test_start_decoupled_parent_workflow_uses_explicit_project_version_context(monkeypatch):
    project_id = uuid4()
    workflow_input = {"project_id": str(project_id)}
    captured: dict[str, object] = {}

    class Client:
        async def start_workflow(self, *_, **kwargs):
            captured["id"] = kwargs["id"]
            captured["context"] = current_project_context()
            captured["search_attributes"] = kwargs["search_attributes"]
            return type("WorkflowHandle", (), {"id": kwargs["id"]})()

    monkeypatch.setattr("temporal.utils.is_in_workflow", lambda: False)
    monkeypatch.setattr("temporal.utils.get_temporal_client", AsyncMock(return_value=Client()))

    with use_project_context(project_id, 3):
        result = await start_decoupled_parent_workflow(
            StartDecoupledParentWorkflowInput(
                workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
                workflow_input=workflow_input,
                task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
                project_id=project_id,
                project_version=4,
            )
        )
        assert current_project_context() == ProjectContext(project_id=str(project_id), project_version=3)

    assert result == f"{EWMS_ORCHESTRATOR_WORKFLOW_ID}-{project_id}-v4"
    assert captured["id"] == f"{EWMS_ORCHESTRATOR_WORKFLOW_ID}-{project_id}-v4"
    assert captured["context"] == ProjectContext(project_id=str(project_id), project_version=4)
    values = {pair.key.name: pair.value for pair in captured["search_attributes"]}
    assert values[PROJECT_ID_SEARCH_ATTRIBUTE.name] == str(project_id)
    assert values[PROJECT_VERSION_SEARCH_ATTRIBUTE.name] == 4
