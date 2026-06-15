"""Integration tests for GET /me.

Requires docker-compose from 02-backend/authentification to be running.
Run with: pytest -m integration
"""

import base64
import json

import pytest
from fastapi import status
from httpx import AsyncClient


def _decode_jwt_payload(token: str) -> dict[str, object]:
    """Decode JWT payload without signature verification.

    The middle segment of a JWT is base64url-encoded JSON. Decoding it lets
    us assert the response maps the actual token claims — not hardcoded values.
    """
    segment = token.split(".")[1]
    # base64url may omit padding; restore it
    segment += "=" * (4 - len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(segment))


@pytest.mark.integration
async def test_me_response_mirrors_token_claims(
    integration_client: AsyncClient,
    real_user_token: str,
) -> None:
    """Response fields must match the actual claims inside the token."""
    claims = _decode_jwt_payload(real_user_token)

    response = await integration_client.get(
        "/me",
        headers={"Authorization": f"Bearer {real_user_token}"},
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    realm_access = claims.get("realm_access")
    roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
    expected_role = None
    if "admin" in roles:
        expected_role = "admin"
    elif "user" in roles:
        expected_role = "user"

    assert data["userId"] == claims["sub"]
    assert data["email"] == claims.get("email")
    assert data["firstName"] == claims.get("given_name")
    assert data["lastName"] == claims.get("family_name")
    assert data["role"] == expected_role


@pytest.mark.integration
async def test_me_returns_401_without_token(integration_client: AsyncClient) -> None:
    """No Authorization header → 401."""
    response = await integration_client.get("/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.integration
async def test_me_returns_401_with_invalid_token(integration_client: AsyncClient) -> None:
    """Garbage token → 401 (signature validation fails)."""
    response = await integration_client.get(
        "/me",
        headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
