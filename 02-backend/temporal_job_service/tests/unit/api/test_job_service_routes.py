"""Route tests for the temporal job service API."""

from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from src.api.routes import job_service as job_service_route
from src.models.schemas.job_service_schemas import GetWorkflowsByTypeResponse
from src.temporal.client import get_temporal_client


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(job_service_route.router)
    app.dependency_overrides[get_temporal_client] = lambda: object()

    with TestClient(app) as test_client:
        yield test_client


def test_get_workflows_by_type_returns_response_model_and_passes_filters(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    project_id = uuid4()

    async def fake_get_workflows_by_type(
        *,
        project_id: UUID,
        workflow_type: str,
        include_children: bool,
        project_version: int | None,
        temporal_client: object,
    ) -> GetWorkflowsByTypeResponse:
        captured.update(
            {
                "project_id": project_id,
                "workflow_type": workflow_type,
                "include_children": include_children,
                "project_version": project_version,
                "temporal_client": temporal_client,
            }
        )
        return GetWorkflowsByTypeResponse(
            project_id=project_id,
            workflow_type=workflow_type,
            include_children=include_children,
            retrieved_workflows=1,
            workflows=[
                {
                    "workflow_id": "wf-1",
                    "run_id": "run-1",
                    "project_id": project_id,
                    "workflow_type": workflow_type,
                    "status": "completed",
                    "children": [],
                }
            ],
        )

    monkeypatch.setattr(
        job_service_route.service,
        "get_workflows_by_type",
        fake_get_workflows_by_type,
    )

    response = client.get(
        f"/temporal/workflows/{project_id}/by-type",
        params={
            "workflow_type": "BatchMVPWorkflow",
            "include_children": "true",
            "project_version": "7",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert captured == {
        "project_id": project_id,
        "workflow_type": "BatchMVPWorkflow",
        "include_children": True,
        "project_version": 7,
        "temporal_client": captured["temporal_client"],
    }
    assert response.json() == {
        "project_id": str(project_id),
        "workflow_type": "BatchMVPWorkflow",
        "include_children": True,
        "retrieved_workflows": 1,
        "workflows": [
            {
                "workflow_id": "wf-1",
                "run_id": "run-1",
                "project_id": str(project_id),
                "project_version": None,
                "workflow_type": "BatchMVPWorkflow",
                "status": "completed",
                "workflow_start_time": None,
                "workflow_close_time": None,
                "children": [],
            }
        ],
    }


def test_get_workflows_by_type_rejects_invalid_workflow_type_before_service_call(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    called = False

    async def fake_get_workflows_by_type(**_: object) -> GetWorkflowsByTypeResponse:
        nonlocal called
        called = True
        raise AssertionError("service should not be called for invalid workflow_type")

    monkeypatch.setattr(
        job_service_route.service,
        "get_workflows_by_type",
        fake_get_workflows_by_type,
    )

    response = client.get(
        f"/temporal/workflows/{project_id}/by-type",
        params={"workflow_type": 'BatchMVPWorkflow"'},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert called is False
    assert response.json()["detail"][0]["loc"] == ["query", "workflow_type"]
    assert response.json()["detail"][0]["type"] == "string_pattern_mismatch"
