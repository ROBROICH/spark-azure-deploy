from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
    use_project_context,
)

from src.api.routes.workflows_api import orchestrate_fvp_workflow, start_batch_mvp_workflow
from src.models.schemas.temporal.fvp import FVPWorkflowRequest
from src.models.schemas.workflows import BatchMVPRequest
from src.workflows.batch_mvp.workflow import BATCH_MVP_WORKFLOW_ID

LATEST_PROJECT_VERSION = 7


@pytest.mark.asyncio
async def test_start_batch_mvp_workflow_uses_project_scoped_id_without_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    workflow_id = f"{BATCH_MVP_WORKFLOW_ID}-{project_id}"
    start_workflow = AsyncMock(return_value=SimpleNamespace(id=workflow_id))
    latest_project_version = AsyncMock(return_value=LATEST_PROJECT_VERSION)
    monkeypatch.setattr("src.api.routes.workflows_api.start_workflow", start_workflow)
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", latest_project_version)

    response = await start_batch_mvp_workflow(BatchMVPRequest(project_id=project_id))

    assert response.parent_job_id == workflow_id
    await_args = start_workflow.await_args
    assert await_args is not None
    kwargs = await_args.kwargs
    assert kwargs["workflow_id"] == BATCH_MVP_WORKFLOW_ID
    assert kwargs["input"].project_id == project_id
    assert kwargs["project_id"] == str(project_id)
    assert kwargs["project_version"] == LATEST_PROJECT_VERSION
    assert kwargs["_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID"] == workflow_id
    assert "-v7" not in workflow_id
    latest_project_version.assert_awaited_once_with(project_id)


@pytest.mark.asyncio
async def test_orchestrate_fvp_workflow_marks_project_in_progress_after_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    workflow_id = f"FVPWorkflow-{project_id}"
    start_fvp_workflow = AsyncMock(return_value=SimpleNamespace(id=workflow_id))
    latest_project_version = AsyncMock(return_value=7)
    update_project_status = AsyncMock()
    monkeypatch.setattr("src.api.routes.workflows_api.start_fvp_workflow", start_fvp_workflow)
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", latest_project_version)
    monkeypatch.setattr("src.api.routes.workflows_api.PlsApiClient.update_project_status", update_project_status)

    response = await orchestrate_fvp_workflow(FVPWorkflowRequest(project_id=project_id))

    assert response.parent_job_id == workflow_id
    latest_project_version.assert_awaited_once_with(project_id)
    start_fvp_workflow.assert_awaited_once()
    assert start_fvp_workflow.await_args.kwargs["project_version"] == 7
    update_project_status.assert_awaited_once_with(project_id, "IN_PROGRESS")


@pytest.mark.asyncio
async def test_orchestrate_fvp_workflow_starts_with_latest_version_search_attributes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    captured: dict[str, object] = {}
    latest_project_version = AsyncMock(return_value=2)
    update_project_status = AsyncMock()

    class Client:
        async def start_workflow(self, *args: object, **kwargs: object) -> SimpleNamespace:
            captured["workflow"] = args[0]
            captured["id"] = kwargs["id"]
            captured["context"] = current_project_context()
            captured["search_attributes"] = kwargs["search_attributes"]
            return SimpleNamespace(id=kwargs["id"])

    monkeypatch.setattr("temporal.utils.is_in_workflow", lambda: False)
    monkeypatch.setattr("temporal.utils.get_temporal_client", AsyncMock(return_value=Client()))
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", latest_project_version)
    monkeypatch.setattr("src.api.routes.workflows_api.PlsApiClient.update_project_status", update_project_status)

    with use_project_context(project_id, 1):
        response = await orchestrate_fvp_workflow(FVPWorkflowRequest(project_id=project_id))
        assert current_project_context() == ProjectContext(project_id=project_id, project_version=1)

    assert response.parent_job_id == f"FVPWorkflow-{project_id}-v2"
    assert captured["id"] == f"FVPWorkflow-{project_id}-v2"
    assert captured["context"] == ProjectContext(project_id=project_id, project_version=2)
    values = {pair.key.name: pair.value for pair in captured["search_attributes"]}
    assert values[PROJECT_ID_SEARCH_ATTRIBUTE.name] == project_id
    assert values[PROJECT_VERSION_SEARCH_ATTRIBUTE.name] == 2
    latest_project_version.assert_awaited_once_with(project_id)
    update_project_status.assert_awaited_once_with(project_id, "IN_PROGRESS")


@pytest.mark.asyncio
async def test_orchestrate_fvp_workflow_returns_workflow_id_when_status_update_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    workflow_id = f"FVPWorkflow-{project_id}"
    start_fvp_workflow = AsyncMock(return_value=SimpleNamespace(id=workflow_id))
    latest_project_version = AsyncMock(return_value=7)
    update_project_status = AsyncMock(side_effect=RuntimeError("status update failed"))
    logger = MagicMock()
    monkeypatch.setattr("src.api.routes.workflows_api.start_fvp_workflow", start_fvp_workflow)
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", latest_project_version)
    monkeypatch.setattr("src.api.routes.workflows_api.PlsApiClient.update_project_status", update_project_status)
    monkeypatch.setattr("src.api.routes.workflows_api.logger", logger)

    response = await orchestrate_fvp_workflow(FVPWorkflowRequest(project_id=project_id))

    assert response.parent_job_id == workflow_id
    update_project_status.assert_awaited_once_with(project_id, "IN_PROGRESS")
    logger.warn.assert_called_once()
