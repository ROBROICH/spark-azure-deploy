"""Route tests for the temporal job service API."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from authentification.dependencies import get_auth_client, get_current_user, get_verifier
from authentification.enums import AuthMode, OidcRoles
from authentification.models import OidcUserInfo
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from src.api.routes import job_service as job_service_route
from src.models.schemas.job_service_schemas import GetWorkflowResponse, GetWorkflowsByTypeResponse
from src.temporal.client import get_temporal_client


class FakeVerifier:
    auth_mode = AuthMode.STRICT
    requires_user = True


class FakeAuthClient:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed
        self.checks: list[dict[str, object]] = []

    async def check_permission(self, **kwargs: object) -> bool:
        self.checks.append(kwargs)
        return self.allowed


class FailingTemporalDescriptionClient:
    def get_workflow_handle(self, workflow_id: str):
        raise AssertionError("bypass roles should not require ProjectId lookup")


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


@pytest.mark.parametrize("role", [OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE])
def test_get_workflow_bypass_roles_do_not_require_project_id(
    role: OidcRoles,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = FastAPI()
    app.include_router(job_service_route.router)
    fake_auth_client = FakeAuthClient(allowed=False)
    app.dependency_overrides[get_temporal_client] = lambda: FailingTemporalDescriptionClient()
    app.dependency_overrides[get_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_current_user] = lambda: OidcUserInfo(
        sub="00000000-0000-0000-0000-000000000001",
        realm_roles=[role],
    )
    app.dependency_overrides[get_auth_client] = lambda: fake_auth_client

    async def fake_get_workflow(**_: object) -> GetWorkflowResponse:
        return GetWorkflowResponse(
            workflow_id="wf-1",
            workflow_type="LegacyWorkflow",
            workflow_start_time=datetime(2026, 4, 15, 9, 0, tzinfo=UTC),
            workflow_close_time=None,
            status="running",
            result=None,
            children=[],
        )

    monkeypatch.setattr(job_service_route.service, "get_workflow", fake_get_workflow)

    with TestClient(app) as test_client:
        response = test_client.get("/temporal/workflows/wf-1")

    assert response.status_code == status.HTTP_200_OK
    assert fake_auth_client.checks == []
