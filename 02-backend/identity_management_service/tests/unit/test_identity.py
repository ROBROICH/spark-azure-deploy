"""Route behavior tests for GET /me.

These tests verify endpoint behavior given different auth states.
Token validation itself is covered by the authentification package's own tests.
"""

from authentification.dependencies import get_current_user, get_privileged_oidc_client
from authentification.enums import OidcRoles
from authentification.models import OidcUserInfo
from fastapi import status
from httpx import ASGITransport, AsyncClient


async def test_get_identity_returns_200_with_valid_user(authenticated_client: AsyncClient) -> None:
    """Valid user provided by auth layer → 200 with all identity fields."""
    response = await authenticated_client.get("/me")

    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["userId"] == "00000000-0000-0000-0000-000000000001"
    assert data["email"] == "testuser@example.com"
    assert data["firstName"] == "Test"
    assert data["lastName"] == "User"
    assert data["role"] == "admin"


async def test_get_identity_returns_401_when_no_user(unauthenticated_client: AsyncClient) -> None:
    """No authenticated user (auth disabled or missing token) → 401."""
    response = await unauthenticated_client.get("/me")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


async def test_get_identity_returns_401_when_email_claim_is_missing(app) -> None:
    """Token without email claim is rejected for /me."""
    minimal_user = OidcUserInfo(sub="00000000-0000-0000-0000-000000000002")
    app.dependency_overrides[get_current_user] = lambda: minimal_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Email claim required"


async def test_get_identity_returns_null_role_when_no_supported_realm_role(app) -> None:
    """Tokens without a supported app role still return /me successfully."""
    user_without_supported_role = OidcUserInfo(
        sub="00000000-0000-0000-0000-000000000003",
        email="viewer@example.com",
        realm_roles=["viewer"],
    )
    app.dependency_overrides[get_current_user] = lambda: user_without_supported_role
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["role"] is None


async def test_get_all_identities_returns_users(authenticated_client, monkeypatch):
    response = await authenticated_client.get("/users")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "users": [
            {
                "userId": "00000000-0000-0000-0000-000000000001",
                "email": "testuser@example.com",
                "firstName": "Test",
                "lastName": "User",
                "role": "admin",
            },
        ]
    }


async def test_update_user_roles_only_manages_app_roles(app, authenticated_client, mock_oidc_client):
    app.dependency_overrides[get_privileged_oidc_client] = lambda: mock_oidc_client

    response = await authenticated_client.post(
        "/me/roles",
        json={"roles": [OidcRoles.USER]},
    )

    assert response.status_code == status.HTTP_200_OK
    mock_oidc_client.set_user_realm_roles.assert_awaited_once_with(
        user_id="00000000-0000-0000-0000-000000000001",
        roles=[OidcRoles.USER],
        changeable_roles=[OidcRoles.ADMIN, OidcRoles.USER],
    )
