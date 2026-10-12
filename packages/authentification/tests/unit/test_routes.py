from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from authentification.dependencies import (
    get_auth_client,
    get_verifier,
    list_accessible_resources,
    require_permission_from_body,
    require_permissions,
    require_permissions_from_body,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.resolver import path_param, query_param
from cryptography.hazmat.primitives import serialization
from fastapi import Depends, FastAPI, Query, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field


class ProjectBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: UUID = Field(alias="projectId")


class FileBody(BaseModel):
    id: UUID


class NestedFileBody(BaseModel):
    file: FileBody


class ProjectFileBody(ProjectBody):
    file: FileBody


@pytest.fixture
async def client(verifier, auth_client):
    app = FastAPI(title="Test Project Service")

    @app.get("/projects/by-query")
    async def query_single(
        project_id: UUID = Query(...),
        _: OidcUserInfo = Depends(
            require_permissions((Resource.PROJECT, Permission.READ, query_param("project_id"))),
        ),
    ):
        """Dummy route to test auth mechanism with query params."""
        return {"status": "ok", "project_id": project_id}

    @app.get("/projects/{project_id}")
    async def single(
        project_id: UUID,
        _: OidcUserInfo = Depends(require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))),
    ):
        """Dummy route to test auth mechanism."""
        return {"status": "ok", "project_id": project_id}

    @app.post("/projects/{project_id}/files/{file_id}")
    async def multiple(
        project_id: UUID,
        file_id: UUID,
        body: dict,
        _: OidcUserInfo = Depends(
            require_permissions(
                ("file", Permission.READ, path_param("file_id")),
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
            )
        ),
    ):
        """Dummy route to test auth mechanism with multiple permissions."""
        return {"status": "ok", "body": body, "project_id": project_id}

    @app.post("/projects/{project_id}/admin")
    async def admin_access(
        project_id: UUID,
        body: dict,
        _: OidcUserInfo = Depends(
            require_role(
                allowed_roles=[OidcRoles.ADMIN],
            )
        ),
    ):
        """Dummy route to test auth mechanism for roles."""
        return {"status": "ok", "body": body, "project_id": project_id}

    @app.post("/projects/{project_id}/user")
    async def user_access(
        project_id: UUID,
        body: dict,
        _: OidcUserInfo = Depends(
            require_role(
                allowed_roles=[OidcRoles.USER],
            )
        ),
    ):
        """Dummy route to test auth mechanism for roles."""
        return {"status": "ok", "body": body, "project_id": project_id}

    @app.post("/validated-body")
    async def validated_body(
        body: ProjectBody = Depends(
            require_permission_from_body(
                ProjectBody,
                "project_id",
                Permission.READ,
            )
        ),
    ):
        """Dummy route to test auth from a validated body model."""
        return {"status": "ok", "project_id": body.project_id}

    @app.post("/validated-body-path")
    async def validated_body_path(
        body: NestedFileBody = Depends(
            require_permission_from_body(
                NestedFileBody,
                ("file", "id"),
                Permission.READ,
                "file",
            )
        ),
    ):
        """Dummy route to test auth from a nested validated body model path."""
        return {"status": "ok", "file_id": body.file.id}

    @app.post("/validated-body-multiple")
    async def validated_body_multiple(
        body: ProjectFileBody = Depends(
            require_permissions_from_body(
                ProjectFileBody,
                (Resource.PROJECT, Permission.READ, "project_id"),
                ("file", Permission.READ, ("file", "id")),
            )
        ),
    ):
        """Dummy route to test multiple auth checks from one validated body."""
        return {"status": "ok", "project_id": body.project_id, "file_id": body.file.id}

    @app.get("/projects")
    async def list_perms(
        ids: list[str] = Depends(
            list_accessible_resources(
                resource_type=Resource.PROJECT,
                permission=Permission.READ,
            )
        ),
    ):
        """Dummy route to test the listing of accessible resources."""
        return {"status": "ok", "ids": ids}

    app.dependency_overrides[get_verifier] = lambda: verifier
    app.dependency_overrides[get_auth_client] = lambda: auth_client

    client = TestClient(app)

    yield client


@pytest.fixture
def mock_jwks_fetch(rsa_key_pair, monkeypatch):
    """
    Mocks PyJWKClient.fetch_data() so it always returns a JWKS containing
    your test public key with a fixed kid.
    """
    _private_key, public_key = rsa_key_pair

    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    fake_jwks = {
        "keys": [
            {
                "kid": "test-key-1",
            }
        ]
    }

    def fake_fetch_data(self):
        return fake_jwks

    monkeypatch.setattr(
        "jwt.PyJWKClient.fetch_data",
        fake_fetch_data,
    )

    def fake_get_signing_key_from_jwt(self, jwt_token):
        class FakeSigningKey:
            key = public_pem

        return FakeSigningKey()

    monkeypatch.setattr(
        "jwt.PyJWKClient.get_signing_key_from_jwt",
        fake_get_signing_key_from_jwt,
    )


@pytest.mark.asyncio
async def test_single_allowed(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
    monkeypatch,
):
    """Test allowed access with a real signed JWT"""

    project_id = str(uuid4())

    with patch(
        "authentification.dependencies.AuthClient.check_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        # Return True to simulate allowed access
        mock_check.return_value = True

        headers = {"Authorization": f"Bearer {valid_test_token}"}

        # Make the request
        response = client.get(f"/projects/{project_id}", headers=headers)

        # --- Assertions ---
        assert response.status_code == status.HTTP_200_OK
        # Ensure the permission check was called with expected args
        mock_check.assert_awaited_once_with(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_query_param_allowed(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
    monkeypatch,
):
    """Test allowed access using query param resolver."""

    project_id = str(uuid4())

    with patch(
        "authentification.dependencies.AuthClient.check_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = True

        headers = {"Authorization": f"Bearer {valid_test_token}"}

        response = client.get(
            f"/projects/by-query?project_id={project_id}",
            headers=headers,
        )

        assert response.status_code == status.HTTP_200_OK

        mock_check.assert_awaited_once_with(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_require_permission_from_body_uses_validated_model_value(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
):
    own_project_id = str(uuid4())
    foreign_project_id = str(uuid4())

    with patch(
        "authentification.dependencies.AuthClient.check_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = True

        response = client.post(
            "/validated-body",
            headers={"Authorization": f"Bearer {valid_test_token}"},
            json={
                "project_id": own_project_id,
                "projectId": foreign_project_id,
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["project_id"] == foreign_project_id
        mock_check.assert_awaited_once_with(
            resource_type=Resource.PROJECT,
            resource_id=foreign_project_id,
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_require_permission_from_body_uses_validated_model_path(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
):
    file_id = str(uuid4())

    with patch(
        "authentification.dependencies.AuthClient.check_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = True

        response = client.post(
            "/validated-body-path",
            headers={"Authorization": f"Bearer {valid_test_token}"},
            json={"file": {"id": file_id}},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["file_id"] == file_id
        mock_check.assert_awaited_once_with(
            resource_type="file",
            resource_id=file_id,
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_require_permissions_from_body_uses_multiple_validated_model_paths(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
):
    project_id = str(uuid4())
    file_id = str(uuid4())

    with patch(
        "authentification.dependencies.AuthClient.bulk_check_permissions",
        new_callable=AsyncMock,
    ) as mock_bulk:
        mock_bulk.return_value = {
            (Resource.PROJECT.value, project_id, Permission.READ.value): True,
            ("file", file_id, Permission.READ.value): True,
        }

        response = client.post(
            "/validated-body-multiple",
            headers={"Authorization": f"Bearer {valid_test_token}"},
            json={
                "projectId": project_id,
                "file": {"id": file_id},
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {
            "status": "ok",
            "project_id": project_id,
            "file_id": file_id,
        }
        mock_bulk.assert_awaited_once_with(
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
            checks=[
                {
                    "resource_type": Resource.PROJECT,
                    "resource_id": project_id,
                    "permission": Permission.READ,
                },
                {
                    "resource_type": "file",
                    "resource_id": file_id,
                    "permission": Permission.READ,
                },
            ],
        )


@pytest.mark.asyncio
async def test_multiple_allowed(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
    monkeypatch,
):
    """Test allowed access with multiple required permissions and a real signed JWT"""

    file_id = str(uuid4())
    project_id = str(uuid4())

    # --- Patch AuthClient bulk permission check ---
    with patch(
        "authentification.dependencies.AuthClient.bulk_check_permissions",
        new_callable=AsyncMock,
    ) as mock_bulk:
        # Simulate all permissions granted
        mock_bulk.return_value = {
            ("file", file_id, Permission.READ.value): True,
            (Resource.PROJECT.value, project_id, Permission.READ.value): True,
        }

        headers = {"Authorization": f"Bearer {valid_test_token}"}

        response = client.post(
            f"/projects/{project_id}/files/{file_id}",
            headers=headers,
            json={"metadata": "ok"},
        )

        # --- Assertions ---
        assert response.status_code == 200

        # Verify bulk check was called with correct arguments
        expected_checks = [
            {
                "resource_type": "file",
                "resource_id": file_id,
                "permission": Permission.READ,
            },
            {
                "resource_type": Resource.PROJECT,
                "resource_id": project_id,
                "permission": Permission.READ,
            },
        ]

        mock_bulk.assert_awaited_once_with(
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
            checks=expected_checks,
        )


@pytest.mark.asyncio
async def test_single_denied(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
    monkeypatch,
):
    """Test denied access with a real signed JWT"""

    with patch(
        "authentification.dependencies.AuthClient.check_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = False

        headers = {"Authorization": f"Bearer {valid_test_token}"}

        # Make the request
        response = client.get("/projects/any-project-id", headers=headers)

        # --- Assertions ---
        assert response.status_code == 403
        # Ensure permission check was called with expected args
        mock_check.assert_awaited_once_with(
            resource_type=Resource.PROJECT,
            resource_id="any-project-id",
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_listing_allowed_resources(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
    monkeypatch,
):
    """Test of returning a list of allowed resources."""

    with patch(
        "authentification.dependencies.AuthClient.list_resources_with_permission",
        new_callable=AsyncMock,
    ) as mock_check:
        mock_check.return_value = ["project-1", "project-2"]

        headers = {"Authorization": f"Bearer {valid_test_token}"}

        # Make the request
        response = client.get("/projects", headers=headers)

        # --- Assertions ---
        assert response.status_code == 200
        assert response.json()["ids"] == ["project-1", "project-2"]
        # Ensure the permission check was called with expected args
        mock_check.assert_awaited_once_with(
            resource_type=Resource.PROJECT,
            permission=Permission.READ,
            subject_type=Resource.USER,
            subject_id=valid_user_info.sub,
        )


@pytest.mark.asyncio
async def test_allow_missing_bearer_token_in_dry_run(
    client,
    verifier,
):
    """Test that dry-run requests can continue without a bearer token."""
    before = verifier.auth_mode
    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN

    project_id = str(uuid4())

    response = client.get(f"/projects/{project_id}")

    assert response.status_code == 200

    verifier.auth_mode = before


@pytest.mark.asyncio
async def test_auth_disabled(
    client,
    valid_user_info,
    mock_jwks_fetch,
    verifier,
):
    """Test that requests succeed without a token when auth_mode is DISABLED."""
    before = verifier.auth_mode
    verifier.auth_mode = AuthMode.DISABLED

    project_id = str(uuid4())

    response = client.get(f"/projects/{project_id}")

    assert response.status_code == 200

    verifier.auth_mode = before


@pytest.mark.asyncio
async def test_require_role_allowed(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
):
    """Test that an ADMIN-role user is granted access via require_role."""

    project_id = str(uuid4())

    headers = {"Authorization": f"Bearer {valid_test_token}"}

    response = client.post(
        f"/projects/{project_id}/admin",
        headers=headers,
        json={"file_id": str(uuid4())},
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_require_role_denied(
    client,
    valid_test_token,
    valid_user_info,
    mock_jwks_fetch,
):
    """Test that a USER-role user is denied admin-only access via require_role."""

    project_id = str(uuid4())

    headers = {"Authorization": f"Bearer {valid_test_token}"}

    response = client.post(
        f"/projects/{project_id}/user",
        headers=headers,
        json={"file_id": str(uuid4())},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_require_role_optional_verify_dry_run(
    client,
    verifier,
):
    """Test dry-run mode allows access if no token is present."""
    before = verifier.auth_mode
    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    project_id = str(uuid4())

    response = client.post(
        f"/projects/{project_id}/user",
        json={"file_id": str(uuid4())},
    )

    assert response.status_code == 200
    verifier.auth_mode = before


@pytest.mark.asyncio
async def test_invalid_token_denied(
    client,
):
    """Test access denied for invalid token."""

    project_id = str(uuid4())

    headers = {"Authorization": "Bearer invalid-token"}

    # Make the request
    response = client.get(f"/projects/{project_id}", headers=headers)

    # --- Assertions ---
    assert response.status_code == 401
