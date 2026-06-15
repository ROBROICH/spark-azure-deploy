"""Tests for keycloak_token module."""

import time
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import SecretStr

import src.utils.keycloak_token as kc_mod
from src.utils.keycloak_token import KeycloakToken, get_keycloak_token_provider


@pytest.fixture(autouse=True)
def _reset_singleton() -> Generator[None]:
    """Reset the module-level singleton between tests."""
    kc_mod._instance = None
    yield
    kc_mod._instance = None


class TestKeycloakTokenInit:
    """Tests for KeycloakToken initialization."""

    def test_attributes_set(self) -> None:
        """Test that all attributes are set correctly on init."""
        token = KeycloakToken(
            token_url="https://kc.example.com/token",
            client_id="my-client",
            client_secret="my-secret",
            refresh_margin=60,
        )
        assert token._token_url == "https://kc.example.com/token"
        assert token._client_id == "my-client"
        assert token._client_secret == "my-secret"
        assert token._refresh_margin == 60
        assert token._access_token is None
        assert token._token_expiry == 0

    def test_default_refresh_margin(self) -> None:
        """Test that the default refresh margin is 30 seconds."""
        token = KeycloakToken(
            token_url="https://kc.example.com/token",
            client_id="c",
            client_secret="s",
        )
        assert token._refresh_margin == 30

    def test_rejects_http_token_url(self) -> None:
        """Test that a non-HTTPS token URL raises ValueError."""
        with pytest.raises(ValueError, match="must use HTTPS"):
            KeycloakToken(
                token_url="http://kc.example.com/token",
                client_id="c",
                client_secret="s",
            )


class TestGetToken:
    """Tests for KeycloakToken.get_token."""

    @pytest.fixture
    def token_provider(self) -> KeycloakToken:
        """Create a KeycloakToken instance for testing."""
        return KeycloakToken(
            token_url="https://kc.example.com/token",
            client_id="client",
            client_secret="secret",
        )

    async def test_fetches_new_token(self, token_provider: Any) -> None:
        """Test that a new token is fetched when none is cached."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "new-token-abc",
            "expires_in": 300,
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await token_provider.get_token()

        assert result == "new-token-abc"
        assert token_provider._access_token == "new-token-abc"

    async def test_returns_cached_token_when_valid(self, token_provider: Any) -> None:
        """Test that a valid cached token is returned without HTTP call."""
        token_provider._access_token = "cached-token"
        token_provider._token_expiry = time.time() + 3600

        result = await token_provider.get_token()
        assert result == "cached-token"

    async def test_refreshes_expired_token(self, token_provider: Any) -> None:
        """Test that an expired token triggers a refresh."""
        token_provider._access_token = "old-token"
        token_provider._token_expiry = time.time() - 100  # expired

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "refreshed-token",
            "expires_in": 300,
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await token_provider.get_token()

        assert result == "refreshed-token"


class TestGetKeycloakTokenProvider:
    """Tests for the get_keycloak_token_provider factory function."""

    def test_returns_none_when_not_configured(self) -> None:
        """Test that None is returned when Keycloak credentials are empty."""
        mock_env = MagicMock()
        mock_env.KEYCLOAK_CLIENT_ID = ""
        mock_env.KEYCLOAK_CLIENT_SECRET = SecretStr("")
        mock_env.KEYCLOAK_TOKEN_URL = ""

        with patch("src.env.ENV", mock_env):
            result = get_keycloak_token_provider()

        assert result is None

    def test_creates_instance_when_configured(self) -> None:
        """Test that a KeycloakToken instance is created when credentials are set."""
        mock_env = MagicMock()
        mock_env.KEYCLOAK_CLIENT_ID = "my-client"
        mock_env.KEYCLOAK_CLIENT_SECRET = SecretStr("my-secret")
        mock_env.KEYCLOAK_TOKEN_URL = "https://kc.example.com/token"

        with patch("src.env.ENV", mock_env):
            result = get_keycloak_token_provider()

        assert result is not None
        assert isinstance(result, KeycloakToken)
        assert result._client_id == "my-client"

    def test_returns_cached_singleton(self) -> None:
        """Test that the same singleton instance is returned on subsequent calls."""
        mock_env = MagicMock()
        mock_env.KEYCLOAK_CLIENT_ID = "my-client"
        mock_env.KEYCLOAK_CLIENT_SECRET = SecretStr("my-secret")
        mock_env.KEYCLOAK_TOKEN_URL = "https://kc.example.com/token"

        with patch("src.env.ENV", mock_env):
            first = get_keycloak_token_provider()
            second = get_keycloak_token_provider()

        assert first is second

    def test_raises_on_http_token_url(self) -> None:
        """Test that a non-HTTPS token URL raises ValueError."""
        mock_env = MagicMock()
        mock_env.KEYCLOAK_CLIENT_ID = "my-client"
        mock_env.KEYCLOAK_CLIENT_SECRET = SecretStr("my-secret")
        mock_env.KEYCLOAK_TOKEN_URL = "http://kc.example.com/token"

        with patch("src.env.ENV", mock_env):
            with pytest.raises(ValueError, match="must use HTTPS"):
                get_keycloak_token_provider()
