"""Tests for the Workflow API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from src.workflows.risikohinweise.types import RISIKOHINWEISE_WORKFLOW_ID

EXPECTED_PROJECT_VERSION = 7


@pytest.fixture
def mock_start_diplan_workflow(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    mock.return_value.id = "test-workflow-id"
    monkeypatch.setattr("src.api.routes.workflows_api.start_diplan_workflow", mock)
    return mock


@pytest.fixture
def mock_latest_project_version(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value=EXPECTED_PROJECT_VERSION)
    monkeypatch.setattr("src.api.routes.workflows_api._latest_project_version", mock)
    return mock


@pytest.fixture
def mock_stop_workflow(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr("src.api.routes.workflows_api.stop_workflow", mock)
    return mock


def test_orchestrate_diplan_workflow_success(
    client: TestClient,
    mock_start_diplan_workflow: AsyncMock,
    mock_latest_project_version: AsyncMock,
) -> None:
    """Test successful orchestration of DiPlan workflow."""

    request_id = str(uuid4())

    response = client.post(
        "/workflows/diplan",
        json={
            "request_id": request_id,
            "files": [
                {
                    "url": "https://example.com/doc.pdf",
                    "request_id": request_id,
                    "file_name": "doc.pdf",
                    "file_id": "00000000-0000-0000-0000-000000000001",
                    "folder_name": "folder-A",
                }
            ],
            "folder_information": [
                {
                    "name": "Root Folder",
                    "children": [
                        {
                            "name": "Sub Folder",
                            "id": "sub-1",
                            "required": True,
                            "contentRequirements": "Must contain PDF",
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == status.HTTP_200_OK

    body = response.json()

    assert body["parentJobId"] == "test-workflow-id"
    assert "jobs" not in body

    mock_start_diplan_workflow.assert_awaited_once()
    mock_latest_project_version.assert_awaited_once_with(request_id)


def test_cancel_workflow_success(client: TestClient, mock_stop_workflow: AsyncMock) -> None:
    """Test successful cancellation of workflow."""

    workflow_id = f"di_plan_workflow-{uuid4()}"

    response = client.post(f"/workflows/cancel/{workflow_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["workflowId"] == workflow_id

    mock_stop_workflow.assert_awaited_once_with(workflow_id)


def test_cancel_workflow_failure(client: TestClient) -> None:
    """Test cancellation failure returns 500."""

    workflow_id = f"di_plan_workflow-{uuid4()}"

    with patch(
        "src.api.routes.workflows_api.stop_workflow",
        side_effect=Exception("Failure"),
    ):
        response = client.post(f"/workflows/cancel/{workflow_id}")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json()["detail"] == f"Failed to stop workflow {workflow_id}"


def test_start_risikohinweise_workflow_success(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_latest_project_version: AsyncMock,
) -> None:
    mock = AsyncMock()
    mock.return_value.id = "risk-workflow-id"
    monkeypatch.setattr("src.api.routes.workflows_api.start_workflow", mock)

    project_id = str(uuid4())
    vae_node_id = str(uuid4())
    response = client.post(
        "/workflows/risikohinweise",
        json={"project_id": project_id, "vae_node_id": vae_node_id},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["parentJobId"] == "risk-workflow-id"

    input_arg = mock.call_args.kwargs["input"]
    assert str(input_arg.vae_node_id) == vae_node_id
    assert mock.call_args.kwargs["project_id"] == project_id
    assert mock.call_args.kwargs["project_version"] == EXPECTED_PROJECT_VERSION
    assert mock.call_args.kwargs["workflow_id"] == RISIKOHINWEISE_WORKFLOW_ID
    mock_latest_project_version.assert_awaited_once_with(project_id)
    assert (
        mock.call_args.kwargs["_ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID"]
        == f"{RISIKOHINWEISE_WORKFLOW_ID}-{project_id}-v7-{vae_node_id}"
    )
