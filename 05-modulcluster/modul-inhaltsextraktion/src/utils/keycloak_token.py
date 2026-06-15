"""Keycloak OAuth2 client credentials token management."""

import asyncio
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class KeycloakToken:
    """Async-safe Keycloak token provider with automatic refresh.

    Uses the OAuth2 client credentials flow to obtain and cache access tokens.
    Tokens are refreshed automatically before expiry.
    """

    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str,
        refresh_margin: int = 30,
    ) -> None:
        if not token_url.startswith("https://"):
            raise ValueError(f"Keycloak token URL must use HTTPS to protect credentials: {token_url}")
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._refresh_margin = refresh_margin
        self._access_token: str | None = None
        self._token_expiry: float = 0
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        """Get a valid access token, refreshing if needed.

        Uses a lock to prevent concurrent refresh attempts.
        """
        async with self._lock:
            if self._access_token and time.time() < (self._token_expiry - self._refresh_margin):
                return self._access_token

            logger.debug("Refreshing Keycloak access token")
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30.0),
                limits=httpx.Limits(max_connections=5, max_keepalive_connections=2),
            ) as client:
                response = await client.post(
                    self._token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                    },
                )
                response.raise_for_status()

            data: dict[str, Any] = response.json()
            self._access_token = str(data["access_token"])
            self._token_expiry = time.time() + float(data["expires_in"])
            return self._access_token


_instance: KeycloakToken | None = None


def get_keycloak_token_provider() -> KeycloakToken | None:
    """Get the singleton Keycloak token provider, or None if not configured."""
    global _instance
    if _instance is not None:
        return _instance

    from src.env import ENV

    if not ENV.KEYCLOAK_CLIENT_ID or not ENV.KEYCLOAK_CLIENT_SECRET.get_secret_value() or not ENV.KEYCLOAK_TOKEN_URL:
        return None

    _instance = KeycloakToken(
        token_url=ENV.KEYCLOAK_TOKEN_URL,
        client_id=ENV.KEYCLOAK_CLIENT_ID,
        client_secret=ENV.KEYCLOAK_CLIENT_SECRET.get_secret_value(),
    )
    return _instance
