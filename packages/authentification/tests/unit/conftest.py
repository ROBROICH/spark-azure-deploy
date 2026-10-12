import time
from typing import Any
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from authentification.auth import AuthClient
from authentification.config import AuthSettings
from authentification.enums import AuthMode
from authentification.models import OidcUserInfo
from authentification.verifier import KeycloakVerifier
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey


@pytest.fixture(autouse=True)
def patch_auth_settings(monkeypatch):
    """Mock settings in tests."""
    fake = AuthSettings(
        base_url="https://auth.test",
        realm="dev",
        audience="test-backend",
        spice_db_endpoint="127.0.0.1:50051",
        spice_db_token="test-spicedb-token",
        spice_db_insecure=True,
        mode=AuthMode.OPTIONAL_VERIFY_DRY_RUN,
    )

    monkeypatch.setattr("authentification.config.auth_settings", lambda: fake)
    monkeypatch.setattr("authentification.auth.auth_settings", lambda: fake)
    monkeypatch.setattr("authentification.dependencies.auth_settings", lambda: fake)
    monkeypatch.setattr("authentification.logger.auth_settings", lambda: fake)


@pytest.fixture
def verifier(monkeypatch) -> KeycloakVerifier:
    """Mocked verifier with controlled JWKS behavior."""
    return KeycloakVerifier(
        base_url="https://keycloak.example.com",
        realm="prod",
        audience="your-service-client-id",
        auth_mode=AuthMode.STRICT,
    )


@pytest.fixture
def auth_client(monkeypatch) -> AuthClient:
    """Mocked auth client."""
    mock_async_client = AsyncMock()
    with (
        patch("authentification.auth.AsyncClient", return_value=mock_async_client),
        patch("authentification.auth.AsyncInsecureClient", return_value=mock_async_client),
    ):
        return AuthClient(
            endpoint="localhost:8000",
            token="test-token",
        )


@pytest.fixture
def valid_payload() -> dict[str, Any]:
    """Minimal valid decoded JWT payload."""
    return {
        "sub": "00000000-00000000-00000000-00000000",
        "preferred_username": "alice",
        "azp": "frontend-app",
        "realm_access": {"roles": ["sachbearbeiter", "user"]},
        "iss": "https://keycloak.example.com/realms/prod",
        "aud": "test-service",
        "exp": 9999999999,
        "email": "alice@example.com",
        "name": "Alice Example",
    }


@pytest.fixture
def valid_user_info() -> OidcUserInfo:
    return OidcUserInfo(
        sub="00000000-00000000-00000000-00000000",
        preferred_username="alice",
        azp="frontend-app",
        realm_roles=["admin"],
        email="alice@example.com",
        name="Alice Example",
    )


@pytest.fixture(scope="session")
def rsa_key_pair() -> tuple[RSAPrivateKey, RSAPublicKey]:
    """Generate a RSA key pair once for the test session"""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    public_key = private_key.public_key()
    return private_key, public_key


@pytest.fixture
def valid_test_token(rsa_key_pair, valid_user_info) -> str:
    """Generate a valid-looking JWT signed with our own key"""
    private_key, _ = rsa_key_pair

    payload = {
        "sub": valid_user_info.sub,
        "preferred_username": valid_user_info.preferred_username,
        "iss": "https://keycloak.example.com/realms/prod",
        "aud": "your-service-client-id",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
        "realm_access": {"roles": ["admin"]},
    }

    return jwt.encode(
        payload=payload,
        key=private_key,
        algorithm="RS256",
        headers={"kid": "test-key-1"},
    )
