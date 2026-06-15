"""Integration tests for Risks API endpoints."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient


async def _create_vae_node(integration_client: AsyncClient, project_id) -> str:
    node_id = str(uuid4())
    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "inserts": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {
                        "title": "Risk Chapter",
                        "text": "Generated chapter text",
                        "checked_by_assignee": False,
                        "parent_vae_node_id": None,
                        "order": 1,
                        "frontend_parent_ids": [],
                        "is_hidden": False,
                        "can_add_child": False,
                    },
                }
            ]
        },
    )
    assert response.status_code == status.HTTP_200_OK
    return node_id


@pytest.fixture(autouse=True)
def mock_latest_project_version(monkeypatch):
    latest_version = AsyncMock(return_value=1)
    validate_version = AsyncMock(side_effect=lambda _project_id, project_version: project_version)
    monkeypatch.setattr("src.services.risks_service._get_latest_project_version", latest_version)
    monkeypatch.setattr("src.services.risks_service._validate_project_write_version", validate_version)
    return latest_version


def _risk_payload(*, vae_node_id: str, **overrides) -> dict:
    """Build a minimal valid risk payload dict."""
    base = {
        "problem": "Die Referenz verwendet eine unbekannte Gesetzesabkürzung.",
        "severity": 5,
        "implication": "Formelle Mängel können zur Rechtswidrigkeit des Bescheids führen.",
        "vae_node_id": vae_node_id,
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_risks_returns_201(integration_client: AsyncClient):
    """POST /risks/{project_id} returns 201 and the created risks."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    payload = {"risks": [_risk_payload(vae_node_id=node_id)]}

    response = await integration_client.post(f"/risks/{project_id}", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert len(data) == 1
    assert data[0]["projectId"] == str(project_id)
    assert "id" in data[0]


@pytest.mark.asyncio
async def test_create_risks_multiple(integration_client: AsyncClient):
    """POST /risks/{project_id} creates multiple risks in one request."""
    project_id = uuid4()
    first_node_id = await _create_vae_node(integration_client, project_id)
    second_node_id = await _create_vae_node(integration_client, project_id)
    payload = {
        "risks": [
            _risk_payload(vae_node_id=first_node_id, problem="first issue"),
            _risk_payload(vae_node_id=second_node_id, problem="second issue", severity=8),
        ]
    }

    response = await integration_client.post(f"/risks/{project_id}", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_create_risks_extra_fields_ignored(integration_client: AsyncClient):
    """POST /risks/{project_id} ignores unknown fields including position."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    payload = {
        "risks": [
            {
                **_risk_payload(vae_node_id=node_id),
                "position": [0, 42],
                "unknown_field": "should be ignored",
            }
        ]
    }

    response = await integration_client.post(f"/risks/{project_id}", json=payload)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_create_risks_with_optional_fields(integration_client: AsyncClient):
    """POST /risks/{project_id} persists all optional fields correctly."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    payload = {
        "risks": [
            {
                **_risk_payload(vae_node_id=node_id),
                "recommendation": "Prüfen und korrigieren",
                "quote": "und Ausbau der Tank- und Rastanlage...",
            }
        ]
    }

    response = await integration_client.post(f"/risks/{project_id}", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()[0]
    assert data["recommendation"] == "Prüfen und korrigieren"
    assert data["quote"] == "und Ausbau der Tank- und Rastanlage..."


@pytest.mark.asyncio
async def test_get_risks_returns_200(integration_client: AsyncClient):
    """GET /risks/{project_id} returns risks for the project."""
    project_id = uuid4()
    first_node_id = await _create_vae_node(integration_client, project_id)
    second_node_id = await _create_vae_node(integration_client, project_id)
    await integration_client.post(
        f"/risks/{project_id}",
        json={
            "risks": [
                _risk_payload(vae_node_id=first_node_id),
                _risk_payload(vae_node_id=second_node_id, problem="second"),
            ]
        },
    )

    response = await integration_client.get(f"/risks/{project_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    assert all(r["projectId"] == str(project_id) for r in data)


@pytest.mark.asyncio
async def test_get_risks_returns_empty_list_when_none_exist(
    integration_client: AsyncClient,
):
    """GET /risks/{project_id} returns 200 with empty list when no risks exist."""
    project_id = uuid4()

    response = await integration_client.get(f"/risks/{project_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_risks_excludes_soft_deleted_rows(integration_client: AsyncClient):
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    create_response = await integration_client.post(
        f"/risks/{project_id}",
        json={"risks": [_risk_payload(vae_node_id=node_id)]},
    )
    risk_id = create_response.json()[0]["id"]

    delete_response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={"deletes": [{"node_type": "risks", "id": risk_id}]},
    )
    assert delete_response.status_code == status.HTTP_200_OK

    response = await integration_client.get(f"/risks/{project_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_risks_only_returns_own_project(integration_client: AsyncClient):
    """GET /risks/{project_id} does not return risks from other projects."""
    project_a = uuid4()
    project_b = uuid4()
    node_a = await _create_vae_node(integration_client, project_a)
    node_b1 = await _create_vae_node(integration_client, project_b)
    node_b2 = await _create_vae_node(integration_client, project_b)
    await integration_client.post(f"/risks/{project_a}", json={"risks": [_risk_payload(vae_node_id=node_a)]})
    await integration_client.post(
        f"/risks/{project_b}",
        json={"risks": [_risk_payload(vae_node_id=node_b1), _risk_payload(vae_node_id=node_b2)]},
    )

    response = await integration_client.get(f"/risks/{project_a}")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_update_risk_returns_updated_risk(integration_client: AsyncClient):
    """PATCH /risks/{risk_id} returns the updated risk object."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    create_response = await integration_client.post(
        f"/risks/{project_id}",
        json={"risks": [_risk_payload(vae_node_id=node_id)]},
    )
    risk_id = create_response.json()[0]["id"]

    response = await integration_client.patch(
        f"/risks/{risk_id}",
        json={"problem": "updated problem", "severity": 8},
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == risk_id
    assert data["problem"] == "updated problem"
    assert data["severity"] == 8


@pytest.mark.asyncio
async def test_update_risk_persists_changes(integration_client: AsyncClient):
    """PATCH /risks/{risk_id} changes are reflected in subsequent GET."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    create_response = await integration_client.post(
        f"/risks/{project_id}",
        json={"risks": [_risk_payload(vae_node_id=node_id)]},
    )
    risk_id = create_response.json()[0]["id"]

    await integration_client.patch(
        f"/risks/{risk_id}",
        json={"problem": "updated problem", "severity": 8},
    )

    get_response = await integration_client.get(f"/risks/{project_id}")
    updated = get_response.json()[0]
    assert updated["problem"] == "updated problem"
    assert updated["severity"] == 8


@pytest.mark.asyncio
async def test_update_risk_not_found(integration_client: AsyncClient):
    """PATCH /risks/{risk_id} returns 404 for a non-existent risk."""
    response = await integration_client.patch(
        f"/risks/{uuid4()}",
        json={"problem": "irrelevant"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_update_risk_null_non_nullable_field_returns_422(
    integration_client: AsyncClient,
):
    """PATCH /risks/{risk_id} returns 422 when setting a non-nullable field to null."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    create_response = await integration_client.post(
        f"/risks/{project_id}",
        json={"risks": [_risk_payload(vae_node_id=node_id)]},
    )
    risk_id = create_response.json()[0]["id"]

    response = await integration_client.patch(
        f"/risks/{risk_id}",
        json={"vae_node_id": None},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.asyncio
async def test_create_risks_invalid_severity(integration_client: AsyncClient):
    """POST /risks/{project_id} returns 422 for invalid severity."""
    project_id = uuid4()
    node_id = await _create_vae_node(integration_client, project_id)
    payload = {"risks": [_risk_payload(vae_node_id=node_id, severity=11)]}

    response = await integration_client.post(f"/risks/{project_id}", json=payload)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
