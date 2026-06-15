from uuid import UUID, uuid4

import pytest
from authentification import auth_utils
from authentification.dependencies import get_auth_client, get_current_user, get_verifier
from authentification.enums import AuthMode, Permission
from authentification.models import OidcUserInfo
from fastapi import status
from httpx import AsyncClient

from src.main import app
from src.models.risk_enums import RiskStatus

pytestmark = pytest.mark.integration


@pytest.fixture
async def project_id() -> UUID:
    return uuid4()


@pytest.fixture
async def create_vae_node(integration_client: AsyncClient, project_id: UUID) -> dict:
    payload = {
        "inserts": [
            {
                "node_type": "vae_node",
                "id": str(uuid4()),
                "payload": {
                    "title": "1. Main Section",
                    "text": "...",
                    "checked_by_assignee": False,
                    "checked_at_assignee": "2026-03-25T09:32:35.234Z",
                    "parent_vae_node_id": None,
                    "order": 1,
                    "frontend_parent_ids": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
                    "is_hidden": False,
                    "can_add_child": False,
                },
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    return response.json()


async def test_node_creation_with_uuid(integration_client: AsyncClient, project_id: UUID):
    parent_id = str(uuid4())
    child_id = str(uuid4())
    risk_id = str(uuid4())

    node_payload = {
        "inserts": [
            {
                "node_type": "vae_node",
                "id": parent_id,
                "payload": {
                    "title": "1. Main Section",
                    "text": "...",
                    "checked_by_assignee": False,
                    "checked_at_assignee": "2026-03-25T09:32:35.234Z",
                    "parent_vae_node_id": None,
                    "order": 1,
                    "frontend_parent_ids": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
                    "is_hidden": False,
                    "can_add_child": False,
                },
            },
            {
                "node_type": "vae_node",
                "id": child_id,
                "payload": {
                    "title": "1.1. Sub Section",
                    "text": "...",
                    "checked_by_assignee": False,
                    "checked_at_assignee": "2026-03-25T09:32:35.234Z",
                    "parent_vae_node_id": parent_id,
                    "order": 1,
                    "frontend_parent_ids": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
                    "is_hidden": False,
                    "can_add_child": False,
                },
            },
        ]
    }

    node_response = await integration_client.post(f"/{project_id}/update?project_version=1", json=node_payload)
    assert node_response.status_code == status.HTTP_200_OK
    node_data = node_response.json()["inserted"]
    assert len(node_data) == 2
    assert node_data[0]["node_type"] == "vae_node"
    assert node_data[0]["id"] == parent_id
    assert node_data[1]["node_type"] == "vae_node"
    assert node_data[1]["id"] == child_id
    assert node_data[1]["parent_vae_node_id"] == parent_id

    risk_payload = {
        "inserts": [
            {
                "node_type": "risks",
                "id": risk_id,
                "payload": {
                    "vae_node_id": child_id,
                    "recommendation": "...",
                    "quote": "string",
                    "status": RiskStatus.OPEN,
                    "problem": "Die Referenz verwendet ...",
                    "severity": 5,
                    "implication": "Formelle Mängel können zur ...",
                },
            }
        ]
    }

    risk_response = await integration_client.post(f"/{project_id}/update?project_version=1", json=risk_payload)
    assert risk_response.status_code == status.HTTP_200_OK
    risk_data = risk_response.json()["inserted"]
    assert len(risk_data) == 1
    assert risk_data[0]["node_type"] == "risks"
    assert risk_data[0]["id"] == risk_id
    assert risk_data[0]["vae_node_id"] == child_id


async def test_node_creation_without_uuid(integration_client: AsyncClient, project_id: UUID):
    payload = {
        "inserts": [
            {
                "node_type": "vae_node",
                "payload": {
                    "title": "1. Main Section",
                    "text": "...",
                    "checked_by_assignee": False,
                    "checked_at_assignee": "2026-03-25T09:32:35.234Z",
                    "parent_vae_node_id": None,
                    "order": 1,
                    "frontend_parent_ids": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
                    "is_hidden": False,
                },
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["inserted"]
    assert len(data) == 1
    assert isinstance(UUID(data[0]["id"]), UUID)


async def test_node_creation_missing_parent_raises(integration_client: AsyncClient, project_id: UUID):
    payload = {
        "inserts": [
            {
                "node_type": "vae_node",
                "id": str(uuid4()),
                "payload": {
                    "title": "1. Main Section",
                    "text": "...",
                    "checked_by_assignee": False,
                    "checked_at_assignee": "2026-03-25T09:32:35.234Z",
                    "parent_vae_node_id": str(uuid4()),
                    "order": 1,
                    "frontend_parent_ids": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
                    "is_hidden": False,
                },
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_409_CONFLICT


async def test_node_update(integration_client: AsyncClient, create_vae_node: dict, project_id: UUID):
    node_id = create_vae_node["inserted"][0]["id"]
    payload = {
        "updates": [
            {
                "node_type": "vae_node",
                "id": node_id,
                "payload": {
                    "checked_by_assignee": True,
                    "checked_at_assignee": "2026-03-24T09:32:35.234Z",
                },
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["updated"]
    assert len(data) == 1
    assert data[0]["node_type"] == "vae_node"
    assert data[0]["id"] == node_id
    assert data[0]["checked_by_assignee"]
    assert data[0]["checked_at_assignee"] == "2026-03-24T09:32:35.234000Z"


async def test_node_delete(integration_client: AsyncClient, create_vae_node: dict, project_id: UUID):
    node_id = create_vae_node["inserted"][0]["id"]
    payload = {
        "deletes": [
            {
                "node_type": "vae_node",
                "id": node_id,
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["deleted"]
    assert len(data) == 1
    assert data[0]["node_type"] == "vae_node"
    assert data[0]["id"] == node_id


async def test_get_batch_nodes(integration_client: AsyncClient, project_id: UUID, create_vae_node: dict):
    node_id = create_vae_node["inserted"][0]["id"]

    payload = {"nodes": [{"node_type": "vae_node", "id": node_id}]}
    response = await integration_client.post(f"/{project_id}/batch-nodes?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["results"]
    assert data[0] == create_vae_node["inserted"][0]


async def test_node_insert_with_assignee(integration_client: AsyncClient, project_id: UUID):
    assignee_uuid = str(uuid4())
    node_id = str(uuid4())

    payload = {
        "inserts": [
            {
                "node_type": "vae_node",
                "id": node_id,
                "payload": {
                    "title": "Assigned Section",
                    "text": "...",
                    "assignee": assignee_uuid,
                    "checked_by_assignee": False,
                    "parent_vae_node_id": None,
                    "order": 1,
                    "frontend_parent_ids": [],
                    "is_hidden": False,
                    "can_add_child": False,
                },
            }
        ]
    }

    response = await integration_client.post(f"/{project_id}/update?project_version=1", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["inserted"]
    assert len(data) == 1
    assert data[0]["assignee"] == assignee_uuid


async def test_node_patch_assignee(integration_client: AsyncClient, project_id: UUID):
    node_id = str(uuid4())

    # Insert without assignee
    await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "inserts": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {
                        "title": "Unassigned Section",
                        "text": "...",
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

    # Patch assignee
    assignee_uuid = str(uuid4())
    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "updates": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {"assignee": assignee_uuid},
                }
            ]
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["updated"]
    assert len(data) == 1
    assert data[0]["assignee"] == assignee_uuid


async def test_batch_get_includes_assignee(integration_client: AsyncClient, project_id: UUID):
    assignee_uuid = str(uuid4())
    node_id = str(uuid4())

    await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "inserts": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {
                        "title": "Batch Assignee Test",
                        "text": "...",
                        "assignee": assignee_uuid,
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

    response = await integration_client.post(
        f"/{project_id}/batch-nodes?project_version=1",
        json={"nodes": [{"node_type": "vae_node", "id": node_id}]},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()["results"]
    assert len(data) == 1
    assert data[0]["assignee"] == assignee_uuid


async def test_patch_leader_fields_denied_without_approve_permission(
    integration_client: AsyncClient,
    monkeypatch,
    project_id: UUID,
    create_vae_node: dict,
):
    node_id = create_vae_node["inserted"][0]["id"]
    fake_auth_client = _FakeAuthClient(denied_permissions={Permission.APPROVE})
    _override_auth_dependencies(monkeypatch, fake_auth_client)

    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "updates": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {"checked_by_leader": True},
                }
            ]
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Access denied"}
    assert [call["permission"] for call in fake_auth_client.calls] == [Permission.UPDATE, Permission.APPROVE]


async def test_patch_leader_timestamp_denied_without_approve_permission(
    integration_client: AsyncClient,
    monkeypatch,
    project_id: UUID,
    create_vae_node: dict,
):
    node_id = create_vae_node["inserted"][0]["id"]
    fake_auth_client = _FakeAuthClient(denied_permissions={Permission.APPROVE})
    _override_auth_dependencies(monkeypatch, fake_auth_client)

    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "updates": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {"checked_at_leader": "2026-03-24T09:32:35.234Z"},
                }
            ]
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Access denied"}
    assert [call["permission"] for call in fake_auth_client.calls] == [Permission.UPDATE, Permission.APPROVE]


async def test_patch_leader_fields_allowed_with_approve_permission(
    integration_client: AsyncClient,
    monkeypatch,
    project_id: UUID,
    create_vae_node: dict,
):
    node_id = create_vae_node["inserted"][0]["id"]
    fake_auth_client = _FakeAuthClient(denied_permissions=set())
    _override_auth_dependencies(monkeypatch, fake_auth_client)

    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "updates": [
                {
                    "node_type": "vae_node",
                    "id": node_id,
                    "payload": {
                        "checked_by_leader": True,
                        "checked_at_leader": "2026-03-24T09:32:35.234Z",
                    },
                }
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()["updated"]
    assert len(data) == 1
    assert data[0]["checked_by_leader"] is True
    assert data[0]["checked_at_leader"] == "2026-03-24T09:32:35.234000Z"
    assert [call["permission"] for call in fake_auth_client.calls] == [
        Permission.UPDATE,
        Permission.APPROVE,
    ]


async def test_create_node_allows_explicit_default_leader_values_without_approve_permission(
    integration_client: AsyncClient,
    monkeypatch,
    project_id: UUID,
):
    fake_auth_client = _FakeAuthClient(denied_permissions={Permission.APPROVE})
    _override_auth_dependencies(monkeypatch, fake_auth_client)

    response = await integration_client.post(
        f"/{project_id}/update?project_version=1",
        json={
            "inserts": [
                {
                    "node_type": "vae_node",
                    "id": str(uuid4()),
                    "payload": {
                        "title": "Default Leader Values",
                        "text": "...",
                        "checked_by_assignee": False,
                        "checked_by_leader": False,
                        "checked_at_assignee": None,
                        "checked_at_leader": None,
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
    assert [call["permission"] for call in fake_auth_client.calls] == [Permission.UPDATE]


def _override_auth_dependencies(monkeypatch, fake_auth_client) -> None:
    monkeypatch.setattr(auth_utils, "get_logger", lambda: _FakeLogger())
    app.dependency_overrides[get_current_user] = lambda: OidcUserInfo(
        sub=str(uuid4()),
        realm_roles=["user"],
    )
    app.dependency_overrides[get_verifier] = lambda: _FakeVerifier()
    app.dependency_overrides[get_auth_client] = lambda: fake_auth_client


class _FakeVerifier:
    auth_mode = AuthMode.STRICT
    requires_user = True


class _FakeAuthClient:
    def __init__(self, denied_permissions):
        self.denied_permissions = set(denied_permissions)
        self.calls = []

    async def check_permission(
        self,
        *,
        resource_type,
        resource_id,
        permission,
        subject_type,
        subject_id,
    ):
        self.calls.append(
            {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "permission": permission,
                "subject_type": subject_type,
                "subject_id": subject_id,
            }
        )
        return permission not in self.denied_permissions

    async def bulk_check_permissions(
        self,
        *,
        subject_type,
        subject_id,
        checks,
    ):
        results = {}

        for check in checks:
            self.calls.append(
                {
                    "resource_type": check["resource_type"],
                    "resource_id": check["resource_id"],
                    "permission": check["permission"],
                    "subject_type": subject_type,
                    "subject_id": subject_id,
                }
            )
            key = (
                str(check["resource_type"]),
                str(check["resource_id"]),
                str(check["permission"]),
            )
            results[key] = check["permission"] not in self.denied_permissions

        return results


class _FakeLogger:
    def info(self, **_kwargs):
        pass

    def warn(self, **_kwargs):
        pass
