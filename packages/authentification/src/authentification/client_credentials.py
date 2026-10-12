import asyncio
import logging
import threading
import time
import weakref
from collections.abc import AsyncGenerator, Generator
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any, override
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

DEFAULT_REFRESH_MARGIN_SECONDS = 30.0
DEFAULT_TIMEOUT_SECONDS = 30.0


class ClientCredentialsTokenError(RuntimeError):
    pass


@dataclass(frozen=True)
class _CachedToken:
    access_token: str
    refresh_at: float


def _validate_token_url(token_url: str, *, allow_insecure_http: bool) -> None:
    parts = urlsplit(token_url)
    allowed_schemes = {"https", "http"} if allow_insecure_http else {"https"}
    if parts.scheme not in allowed_schemes or not parts.netloc:
        raise ValueError(f"Token URL must use HTTPS to protect client credentials: {token_url}")


class ClientCredentialsTokenProvider(httpx.Auth):
    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str,
        *,
        scope: str | None = None,
        audience: str | None = None,
        refresh_margin: float = DEFAULT_REFRESH_MARGIN_SECONDS,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        allow_insecure_http: bool = False,
    ) -> None:
        if not client_id or not client_secret:
            raise ValueError("client_id and client_secret are required for the client_credentials grant")
        if refresh_margin < 0:
            raise ValueError("refresh_margin must not be negative")
        _validate_token_url(token_url, allow_insecure_http=allow_insecure_http)

        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._scope = scope
        self._audience = audience
        self._refresh_margin = refresh_margin
        self._timeout = timeout
        self._cached: _CachedToken | None = None
        self._sync_lock = threading.Lock()
        self._async_locks: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = (
            weakref.WeakKeyDictionary()
        )

    @override
    def __repr__(self) -> str:
        return f"{type(self).__name__}(token_url={self._token_url!r}, client_id={self._client_id!r})"

    @property
    def token_url(self) -> str:
        return self._token_url

    @property
    def client_id(self) -> str:
        return self._client_id

    def invalidate(self, rejected_token: str) -> None:
        cached = self._cached
        if cached is not None and cached.access_token == rejected_token:
            self._cached = None

    @override
    def sync_auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response]:
        request.read()
        token = self.get_token()
        request.headers["Authorization"] = f"Bearer {token}"
        response = yield request
        if response.status_code == HTTPStatus.UNAUTHORIZED:
            self.invalidate(token)
            request.headers["Authorization"] = f"Bearer {self.get_token()}"
            yield request

    @override
    async def async_auth_flow(self, request: httpx.Request) -> AsyncGenerator[httpx.Request, httpx.Response]:
        await request.aread()
        token = await self.aget_token()
        request.headers["Authorization"] = f"Bearer {token}"
        response = yield request
        if response.status_code == HTTPStatus.UNAUTHORIZED:
            self.invalidate(token)
            request.headers["Authorization"] = f"Bearer {await self.aget_token()}"
            yield request

    def get_token(self, client: httpx.Client | None = None) -> str:
        cached = self._valid_cached_token()
        if cached is not None:
            return cached

        with self._sync_lock:
            cached = self._valid_cached_token()
            if cached is not None:
                return cached

            logger.debug("Requesting client-credentials token for client_id=%s", self._client_id)
            if client is not None:
                response = client.post(self._token_url, data=self._form_data(), timeout=self._timeout)
            else:
                with httpx.Client(timeout=self._timeout) as own_client:
                    response = own_client.post(self._token_url, data=self._form_data())
            return self._store(response)

    async def aget_token(self, client: httpx.AsyncClient | None = None) -> str:
        cached = self._valid_cached_token()
        if cached is not None:
            return cached

        async with self._async_locks.setdefault(asyncio.get_running_loop(), asyncio.Lock()):
            cached = self._valid_cached_token()
            if cached is not None:
                return cached

            logger.debug("Requesting client-credentials token for client_id=%s", self._client_id)
            if client is not None:
                response = await client.post(self._token_url, data=self._form_data(), timeout=self._timeout)
            else:
                async with httpx.AsyncClient(timeout=self._timeout) as own_client:
                    response = await own_client.post(self._token_url, data=self._form_data())
            return self._store(response)

    def _valid_cached_token(self) -> str | None:
        cached = self._cached
        if cached is not None and time.monotonic() < cached.refresh_at:
            return cached.access_token
        return None

    def _form_data(self) -> dict[str, str]:
        data = {
            "grant_type": "client_credentials",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }
        if self._scope is not None:
            data["scope"] = self._scope
        if self._audience is not None:
            data["audience"] = self._audience
        return data

    def _store(self, response: httpx.Response) -> str:
        response.raise_for_status()

        try:
            payload: Any = response.json()
        except ValueError:
            raise ClientCredentialsTokenError(f"Token response from {self._token_url} is not valid JSON") from None

        access_token = payload.get("access_token") if isinstance(payload, dict) else None
        if not isinstance(access_token, str) or not access_token:
            raise ClientCredentialsTokenError(f"Token response from {self._token_url} contains no access_token")

        expires_in = payload.get("expires_in")
        if isinstance(expires_in, int | float) and not isinstance(expires_in, bool):
            self._cached = _CachedToken(
                access_token=access_token,
                refresh_at=time.monotonic() + float(expires_in) - self._refresh_margin,
            )
        else:
            self._cached = None
        return access_token
