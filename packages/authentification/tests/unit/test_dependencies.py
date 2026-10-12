from unittest.mock import AsyncMock, MagicMock

import pytest
from authentification.config import AuthSettings
from authentification.dependencies import (
    _request_log_context,
    get_current_user,
    list_accessible_resources,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.resolver import path_param, query_param
from authentification.verifier import AuthResolution
from fastapi import HTTPException, Request, status
from starlette.responses import Response


def _dummy_request(headers: dict[str, str] | None = None, query_string: bytes = b"") -> Request:
    raw_headers = [(b"host", b"testserver")]
    raw_headers.extend((name.encode(), value.encode()) for name, value in (headers or {}).items())
    return Request(
        scope={
            "type": "http",
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("testclient", 123),
            "path": "/test",
            "raw_path": b"/test",
            "query_string": query_string,
            "method": "GET",
            "headers": raw_headers,
        }
    )


def test_request_log_context_uses_path_not_full_url():
    request = _dummy_request(query_string=b"access_token=secret-token&email=user@example.test")

    context = _request_log_context(request)

    assert context["url_path"] == "/test"
    assert "path=/test" in context["event_reason"]
    assert "access_token" not in context["event_reason"]
    assert "secret-token" not in context["event_reason"]
    assert "user@example.test" not in context["event_reason"]


@pytest.mark.asyncio
async def test_get_current_user_success_isolated(valid_user_info):
    """
    Test that the current user can successfully authenticate.
    """
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock(
        return_value=AuthResolution(
            user=valid_user_info,
            status="verified",
        )
    )
    mock_verifier.auth_mode = AuthMode.STRICT

    async def fake_get_verifier():
        return mock_verifier

    fake_auth = AsyncMock(credentials="fake.jwt.token")

    result = await get_current_user(
        response=Response(),
        request=_dummy_request(),
        verifier=await fake_get_verifier(),
        authorization=fake_auth,
    )

    assert result == valid_user_info
    mock_verifier.resolve_user.assert_called_once_with("fake.jwt.token")


@pytest.mark.asyncio
async def test_get_current_user_allowed_machine_identity_returns_service_user(monkeypatch):
    """
    Test that an allowed SPIFFE identity authenticates as the synthetic service user.
    """
    spiffe = "spiffe://cluster.local/ns/backend/sa/caller"
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock()

    settings = AuthSettings(
        base_url="https://auth.test",
        realm="dev",
        audience="test-backend",
        spice_db_endpoint="127.0.0.1:50051",
        spice_db_token="test-spicedb-token",
        spice_db_insecure=True,
        allowed_machine_identities=spiffe,
    )
    monkeypatch.setattr("authentification.dependencies.auth_settings", lambda: settings)

    result = await get_current_user(
        response=Response(),
        request=_dummy_request({"x-forwarded-client-cert": f"Hash=abc123;URI={spiffe}"}),
        verifier=mock_verifier,
        authorization=None,
    )

    assert result is not None
    assert result.sub == "00000000-0000-0000-0000-000000000001"
    assert result.preferred_username == "backend/caller"
    assert result.azp == spiffe
    assert result.realm_roles == [OidcRoles.SERVICE]
    assert result.role == OidcRoles.SERVICE
    mock_verifier.resolve_user.assert_not_called()


@pytest.mark.asyncio
async def test_get_current_user_disallowed_machine_identity_rejects_without_bearer(monkeypatch):
    """
    Test that a tokenless service-to-service caller must be explicitly allowlisted.
    """
    spiffe = "spiffe://cluster.local/ns/backend/sa/caller"
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock()

    settings = AuthSettings(
        base_url="https://auth.test",
        realm="dev",
        audience="test-backend",
        spice_db_endpoint="127.0.0.1:50051",
        spice_db_token="test-spicedb-token",
        spice_db_insecure=True,
        allowed_machine_identities="spiffe://cluster.local/ns/other/sa/caller",
    )
    monkeypatch.setattr("authentification.dependencies.auth_settings", lambda: settings)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            response=Response(),
            request=_dummy_request({"x-forwarded-client-cert": f"Hash=abc123;URI={spiffe}"}),
            verifier=mock_verifier,
            authorization=None,
        )

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.detail == "Machine identity not allowed"
    mock_verifier.resolve_user.assert_not_called()


@pytest.mark.asyncio
async def test_get_current_user_ambiguous_machine_identity_rejects_without_bearer(monkeypatch):
    """
    Test that APPEND_FORWARD-style ambiguous XFCC values are not trusted.
    """
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock()

    settings = AuthSettings(
        base_url="https://auth.test",
        realm="dev",
        audience="test-backend",
        spice_db_endpoint="127.0.0.1:50051",
        spice_db_token="test-spicedb-token",
        spice_db_insecure=True,
        allowed_machine_identities="spiffe://cluster.local/ns/backend/sa/caller",
    )
    monkeypatch.setattr("authentification.dependencies.auth_settings", lambda: settings)

    xfcc = (
        "URI=spiffe://evil/ns/bad/sa/fake,"
        "By=spiffe://cluster.local/ns/backend/sa/api;"
        "URI=spiffe://cluster.local/ns/backend/sa/caller"
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            response=Response(),
            request=_dummy_request({"x-forwarded-client-cert": xfcc}),
            verifier=mock_verifier,
            authorization=None,
        )

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.detail == "Invalid machine identity"
    mock_verifier.resolve_user.assert_not_called()


@pytest.mark.asyncio
async def test_get_current_user_bearer_token_takes_precedence_over_machine_identity(valid_user_info):
    """
    Test that end-user bearer authentication is used when present.
    """
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock(
        return_value=AuthResolution(
            user=valid_user_info,
            status="verified",
        )
    )
    mock_verifier.auth_mode = AuthMode.STRICT
    fake_auth = AsyncMock(credentials="fake.jwt.token")

    result = await get_current_user(
        response=Response(),
        request=_dummy_request({"x-forwarded-client-cert": "URI=spiffe://cluster.local/ns/backend/sa/not-allowlisted"}),
        verifier=mock_verifier,
        authorization=fake_auth,
    )

    assert result == valid_user_info
    mock_verifier.resolve_user.assert_called_once_with("fake.jwt.token")


@pytest.mark.asyncio
async def test_get_current_user_no_token_strict(verifier):
    """
    Test that missing/invalid Authorization header raises 401.
    """
    current_mode = verifier.auth_mode
    verifier.auth_mode = AuthMode.STRICT
    fake_auth = AsyncMock(credentials=None)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            response=Response(),
            request=_dummy_request(),
            authorization=fake_auth,
            verifier=verifier,
        )

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Missing or invalid Authorization header" in exc_info.value.detail
    verifier.auth_mode = current_mode


@pytest.mark.asyncio
async def test_get_current_user_dry_run_sets_headers(valid_user_info):
    mock_verifier = AsyncMock()
    mock_verifier.resolve_user = MagicMock(
        return_value=AuthResolution(
            user=valid_user_info,
            status="invalid_fallback_unverified",
        )
    )
    mock_verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    fake_auth = AsyncMock(credentials="fake.jwt.token")
    response = Response()

    result = await get_current_user(
        verifier=mock_verifier,
        authorization=fake_auth,
        response=response,
        request=_dummy_request(),
    )

    assert result == valid_user_info
    assert response.headers["X-Auth-Mode"] == AuthMode.OPTIONAL_VERIFY_DRY_RUN.value
    assert response.headers["X-Auth-Result"] == "invalid_fallback_unverified"
    assert "X-Auth-Mode" in response.headers["Access-Control-Expose-Headers"]
    assert "X-Auth-Result" in response.headers["Access-Control-Expose-Headers"]


@pytest.mark.asyncio
async def test_require_role_success(valid_user_info, verifier):
    """
    Test that the current user can successfully authenticate.
    """
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    dep = require_role(allowed_roles="admin")
    result = await dep(
        request=fake_request,
        response=Response(),
        user=valid_user_info,
        verifier=verifier,
    )

    assert result == valid_user_info


@pytest.mark.asyncio
async def test_require_role_denied(valid_user_info, verifier):
    """
    Test that the current user can successfully authenticate.
    """
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    dep = require_role(allowed_roles="user")

    with pytest.raises(HTTPException) as exc_info:
        await dep(
            request=fake_request,
            response=Response(),
            user=valid_user_info,
            verifier=verifier,
        )

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Access denied" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_role_denied_dry_run_returns_user(valid_user_info, verifier):
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    response = Response()
    dep = require_role(allowed_roles="user")

    result = await dep(
        request=fake_request,
        user=valid_user_info,
        verifier=verifier,
        response=response,
    )

    assert result == valid_user_info
    assert response.headers["X-Auth-Roles"] == "denied"


@pytest.mark.asyncio
async def test_require_permissions_single_allowed(
    valid_user_info,
    monkeypatch,
    verifier,
):
    """
    User with correct role → single permission allowed.
    """
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    # --- Mock AuthClient check_permission ---
    class FakeAuthClient:
        consistency = None

        async def check_permission(
            self,
            *,
            resource_type,
            resource_id,
            permission,
            subject_type,
            subject_id,
        ):
            # Allow permission for test
            return True

    auth_client = FakeAuthClient()

    # --- Instantiate dependency ---
    dep = require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))

    # --- Call dependency ---
    result = await dep(
        request=fake_request,
        response=Response(),
        user=valid_user_info,
        verifier=verifier,
        auth_client=auth_client,
    )

    assert result == valid_user_info


@pytest.mark.asyncio
async def test_require_permissions_single_denied(
    valid_user_info,
    verifier,
):
    """
    User missing permission → 403.
    """

    # --- Fake request (needed for path/query resolvers) ---
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    # --- Fake AuthClient always denying permission ---
    class FakeAuthClient:
        consistency = None

        async def check_permission(
            self,
            *,
            resource_type,
            resource_id,
            permission,
            subject_type,
            subject_id,
        ):
            return False  # Deny permission

    auth_client = FakeAuthClient()

    # --- Instantiate dependency ---
    dep = require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))

    # --- Call dependency and assert 403 ---
    with pytest.raises(HTTPException) as exc_info:
        await dep(
            request=fake_request,
            response=Response(),
            user=valid_user_info,
            verifier=verifier,
            auth_client=auth_client,
        )

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Access denied" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_permissions_strict_without_user_returns_403(verifier):
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    verifier.auth_mode = AuthMode.STRICT
    dep = require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))

    with pytest.raises(HTTPException) as exc_info:
        await dep(
            request=fake_request,
            response=Response(),
            user=None,
            verifier=verifier,
            auth_client=AsyncMock(),
        )

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert exc_info.value.detail == "Authentication required"


@pytest.mark.asyncio
async def test_require_permissions_multiple_some_missing(
    valid_user_info,
    verifier,
):
    """
    Multiple permissions required → fails if any is missing.
    """
    # --- Fake request for resolvers ---
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "POST",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    # --- Fake AuthClient with bulk permission check ---
    class FakeAuthClient:
        consistency = None

        async def bulk_check_permissions(self, *, subject_type, subject_id, checks):
            # Simulate first permission allowed, second missing
            results = {}
            for check in checks:
                if check["permission"] == Permission.CREATE:
                    results[(Resource.PROJECT.value, "test-id", Permission.CREATE.value)] = True
                else:
                    results[(Resource.PROJECT.value, "test-id", Permission.READ.value)] = False
            return results

    auth_client = FakeAuthClient()

    # --- Instantiate dependency with resolvers ---
    dep = require_permissions(
        (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
        (Resource.PROJECT, Permission.READ, path_param("project_id")),
    )

    # --- Call dependency and assert 403 ---
    with pytest.raises(HTTPException) as exc_info:
        await dep(
            request=fake_request,
            response=Response(),
            user=valid_user_info,
            verifier=verifier,
            auth_client=auth_client,
        )

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert "Access denied" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_permissions_bypass_allowed(
    valid_user_info,
    monkeypatch,
    verifier,
):
    """
    User with correct role → single permission allowed.
    """
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    # --- Mock AuthClient check_permission ---
    class FakeAuthClient:
        consistency = None

        async def check_permission(
            self,
            *,
            resource_type,
            resource_id,
            permission,
            subject_type,
            subject_id,
        ):
            # Deny permission for test
            return False

    auth_client = FakeAuthClient()

    # --- Instantiate dependency ---
    dep = require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")), bypass_roles=["admin"])

    # --- Call dependency ---
    result = await dep(
        request=fake_request,
        response=Response(),
        user=valid_user_info,
        verifier=verifier,
        auth_client=auth_client,
    )

    assert result == valid_user_info


@pytest.mark.asyncio
async def test_require_permissions_bypass_skips_resource_resolution(
    valid_user_info,
    verifier,
):
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/files",
            "method": "GET",
            "query_string": b"",
            "headers": {},
        }
    )

    auth_client = AsyncMock()

    dep = require_permissions(
        (Resource.PROJECT, Permission.READ, query_param("project_id")),
        bypass_roles=["admin"],
    )

    result = await dep(
        request=fake_request,
        response=Response(),
        user=valid_user_info,
        verifier=verifier,
        auth_client=auth_client,
    )

    assert result == valid_user_info
    auth_client.check_permission.assert_not_called()
    auth_client.bulk_check_permissions.assert_not_called()


@pytest.mark.asyncio
async def test_require_permissions_single_denied_dry_run_returns_user(
    valid_user_info,
    verifier,
):
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects/test-id",
            "method": "GET",
            "path_params": {"project_id": "test-id"},
            "headers": {},
        }
    )

    class FakeAuthClient:
        consistency = None

        async def check_permission(
            self,
            *,
            resource_type,
            resource_id,
            permission,
            subject_type,
            subject_id,
        ):
            return False

    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    response = Response()
    dep = require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))

    result = await dep(
        request=fake_request,
        user=valid_user_info,
        verifier=verifier,
        auth_client=FakeAuthClient(),
        response=response,
    )

    assert result == valid_user_info
    assert response.headers["X-Auth-Permissions"] == "denied:1/1"


@pytest.mark.asyncio
async def test_list_accessible_resources_dry_run_bypasses_filter(
    valid_user_info,
    verifier,
):
    fake_request = Request(
        scope={
            "type": "http",
            "path": "/projects",
            "method": "GET",
            "path_params": {},
            "headers": {},
        }
    )

    class FakeAuthClient:
        consistency = None

        async def list_resources_with_permission(
            self,
            *,
            resource_type,
            permission,
            subject_type,
            subject_id,
        ):
            return ["project-1", "project-2"]

    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    response = Response()
    dep = list_accessible_resources(
        resource_type=Resource.PROJECT,
        permission=Permission.READ,
    )

    result = await dep(
        request=fake_request,
        user=valid_user_info,
        verifier=verifier,
        auth_client=FakeAuthClient(),
        response=response,
    )

    assert result is None
    assert response.headers["X-Auth-Resource-Filter"] == "bypassed-dry-run:accessible=2"
