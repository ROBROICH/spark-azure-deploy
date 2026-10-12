import asyncio
import logging
import time
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from typing import override
from urllib.parse import parse_qs

import httpx
import pytest
from authentification import client_credentials
from authentification.client_credentials import (
    ClientCredentialsTokenError,
    ClientCredentialsTokenProvider,
)

TOKEN_URL = "https://sso.example.com/realms/test/protocol/openid-connect/token"


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> _Clock:
    fake = _Clock()
    monkeypatch.setattr(client_credentials.time, "monotonic", fake)
    return fake


def _token_handler(
    requests: list[httpx.Request], *, expires_in: object = 300
) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload: dict[str, object] = {"access_token": f"token-{len(requests)}"}
        if expires_in is not None:
            payload["expires_in"] = expires_in
        return httpx.Response(200, json=payload)

    return handler


def _provider() -> ClientCredentialsTokenProvider:
    return ClientCredentialsTokenProvider(TOKEN_URL, "client", "s3cret")


@pytest.mark.parametrize("url", ["http://sso.example.com/token", "ftp://sso.example.com/token", "sso.example.com"])
def test_rejects_non_https_token_url_by_default(url: str) -> None:
    with pytest.raises(ValueError, match="must use HTTPS"):
        ClientCredentialsTokenProvider(url, "client", "s3cret")


def test_allows_http_only_with_explicit_opt_in() -> None:
    provider = ClientCredentialsTokenProvider(
        "http://localhost:9090/token", "client", "s3cret", allow_insecure_http=True
    )
    assert provider.token_url == "http://localhost:9090/token"


def test_requires_client_id_and_secret() -> None:
    with pytest.raises(ValueError, match="client_id and client_secret"):
        ClientCredentialsTokenProvider(TOKEN_URL, "client", "")


def test_repr_does_not_expose_secret() -> None:
    assert "s3cret" not in repr(_provider())


def test_sync_token_is_cached_until_refresh_margin(clock: _Clock) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    with httpx.Client(transport=httpx.MockTransport(_token_handler(requests))) as client:
        assert provider.get_token(client) == "token-1"
        clock.now += 300 - 30 - 1
        assert provider.get_token(client) == "token-1"
        clock.now += 1
        assert provider.get_token(client) == "token-2"

    assert [r.url for r in requests] == [httpx.URL(TOKEN_URL)] * 2
    form = parse_qs(requests[0].content.decode())
    assert form == {"grant_type": ["client_credentials"], "client_id": ["client"], "client_secret": ["s3cret"]}


async def test_async_token_is_cached_and_shared_with_sync_interface(clock: _Clock) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    async with httpx.AsyncClient(transport=httpx.MockTransport(_token_handler(requests))) as client:
        assert await provider.aget_token(client) == "token-1"
        assert await provider.aget_token(client) == "token-1"
    assert provider.get_token() == "token-1"
    assert len(requests) == 1


async def test_concurrent_async_callers_share_one_request(clock: _Clock) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    async with httpx.AsyncClient(transport=httpx.MockTransport(_token_handler(requests))) as client:
        tokens = await asyncio.gather(*(provider.aget_token(client) for _ in range(5)))

    assert tokens == ["token-1"] * 5
    assert len(requests) == 1


def test_token_without_expires_in_is_not_cached(clock: _Clock) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    with httpx.Client(transport=httpx.MockTransport(_token_handler(requests, expires_in=None))) as client:
        assert provider.get_token(client) == "token-1"
        assert provider.get_token(client) == "token-2"


def test_invalidate_drops_only_the_rejected_token(clock: _Clock) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    with httpx.Client(transport=httpx.MockTransport(_token_handler(requests))) as client:
        token = provider.get_token(client)
        provider.invalidate("other-token")
        assert provider.get_token(client) == token
        provider.invalidate(token)
        assert provider.get_token(client) == "token-2"


def test_scope_and_audience_are_sent_only_when_configured() -> None:
    requests: list[httpx.Request] = []
    provider = ClientCredentialsTokenProvider(TOKEN_URL, "client", "s3cret", scope="openid", audience="docling")

    with httpx.Client(transport=httpx.MockTransport(_token_handler(requests))) as client:
        provider.get_token(client)

    form = parse_qs(requests[0].content.decode())
    assert form["scope"] == ["openid"]
    assert form["audience"] == ["docling"]


def test_error_status_raises_without_leaking_body() -> None:
    provider = _provider()

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_client", "leak": "s3cret"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client, pytest.raises(httpx.HTTPStatusError) as exc:
        provider.get_token(client)

    assert "s3cret" not in str(exc.value)


@pytest.mark.parametrize("body", [b"not-json", b'{"token_type": "bearer"}', b'["x"]'])
def test_malformed_success_response_raises_without_body(body: bytes) -> None:
    provider = _provider()

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as client,
        pytest.raises(ClientCredentialsTokenError) as exc,
    ):
        provider.get_token(client)

    assert body.decode() not in str(exc.value)


def test_token_and_secret_are_never_logged(caplog: pytest.LogCaptureFixture) -> None:
    requests: list[httpx.Request] = []
    provider = _provider()

    with (
        caplog.at_level(logging.DEBUG),
        httpx.Client(transport=httpx.MockTransport(_token_handler(requests))) as client,
    ):
        token = provider.get_token(client)

    assert token not in caplog.text
    assert "s3cret" not in caplog.text


class _TokenEndpoint:
    def __init__(self, *, expires_in: object = 300) -> None:
        self.requests: list[httpx.Request] = []
        self._expires_in = expires_in

    def _response(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        payload: dict[str, object] = {"access_token": f"token-{len(self.requests)}"}
        if self._expires_in is not None:
            payload["expires_in"] = self._expires_in
        return httpx.Response(200, json=payload)

    def sync_handler(self, request: httpx.Request) -> httpx.Response:
        time.sleep(0.05)
        return self._response(request)

    async def async_handler(self, request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.01)
        return self._response(request)


def _route_provider_clients(monkeypatch: pytest.MonkeyPatch, endpoint: _TokenEndpoint) -> None:
    real_client = httpx.Client
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs: real_client(**{"transport": httpx.MockTransport(endpoint.sync_handler), **kwargs}),
    )
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real_async_client(**{"transport": httpx.MockTransport(endpoint.async_handler), **kwargs}),
    )


def _api_handler(seen: list[str | None], *, accepted: set[str]) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        authorization = request.headers.get("Authorization")
        seen.append(authorization)
        if authorization in {f"Bearer {token}" for token in accepted}:
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(401)

    return handler


def test_sync_auth_invalidates_rejected_token_and_retries_once(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()
    assert provider.get_token() == "token-1"
    seen: list[str | None] = []

    bodies: list[bytes] = []
    accept = _api_handler(seen, accepted={"token-2"})

    class StreamingTransport(httpx.BaseTransport):
        @override
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            assert isinstance(request.stream, httpx.SyncByteStream)
            bodies.append(b"".join(request.stream))
            return accept(request)

    with httpx.Client(transport=StreamingTransport()) as client:
        response = client.post(
            "https://api.example.com/convert", content=(chunk for chunk in [b"pay", b"load"]), auth=provider
        )

    assert response.status_code == HTTPStatus.OK
    assert seen == ["Bearer token-1", "Bearer token-2"]
    assert bodies == [b"payload", b"payload"]
    assert provider.get_token() == "token-2"
    assert [r.url for r in endpoint.requests] == [httpx.URL(TOKEN_URL)] * 2


async def test_async_auth_invalidates_rejected_token_and_retries_once(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()
    assert await provider.aget_token() == "token-1"
    seen: list[str | None] = []

    bodies: list[bytes] = []
    accept = _api_handler(seen, accepted={"token-2"})

    class StreamingTransport(httpx.AsyncBaseTransport):
        @override
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            assert isinstance(request.stream, httpx.AsyncByteStream)
            bodies.append(b"".join([chunk async for chunk in request.stream]))
            return accept(request)

    async def stream() -> AsyncIterator[bytes]:
        yield b"%P"
        yield b"DF"

    async with httpx.AsyncClient(transport=StreamingTransport()) as client:
        response = await client.post("https://api.example.com/convert", content=stream(), auth=provider)

    assert response.status_code == HTTPStatus.OK
    assert seen == ["Bearer token-1", "Bearer token-2"]
    assert bodies == [b"%PDF", b"%PDF"]
    assert [r.url for r in endpoint.requests] == [httpx.URL(TOKEN_URL)] * 2


async def test_async_auth_returns_second_401_without_another_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()
    seen: list[str | None] = []

    async with httpx.AsyncClient(transport=httpx.MockTransport(_api_handler(seen, accepted=set()))) as client:
        response = await client.get("https://api.example.com/status", auth=provider)

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    with pytest.raises(httpx.HTTPStatusError):
        response.raise_for_status()
    assert seen == ["Bearer token-1", "Bearer token-2"]
    assert [r.url for r in endpoint.requests] == [httpx.URL(TOKEN_URL)] * 2


def test_sync_auth_returns_second_401_without_another_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()
    seen: list[str | None] = []

    with httpx.Client(transport=httpx.MockTransport(_api_handler(seen, accepted=set()))) as client:
        response = client.get("https://api.example.com/status", auth=provider)

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert seen == ["Bearer token-1", "Bearer token-2"]


def test_concurrent_sync_callers_share_one_request(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()

    with ThreadPoolExecutor(max_workers=5) as executor:
        tokens = list(executor.map(lambda _: provider.get_token(), range(5)))

    assert tokens == ["token-1"] * 5
    assert len(endpoint.requests) == 1


async def test_concurrent_async_refresh_after_401_fetches_once(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint()
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()
    assert await provider.aget_token() == "token-1"
    seen: list[str | None] = []

    async with httpx.AsyncClient(transport=httpx.MockTransport(_api_handler(seen, accepted={"token-2"}))) as client:
        responses = await asyncio.gather(
            *(client.get("https://api.example.com/status", auth=provider) for _ in range(5))
        )

    assert [response.status_code for response in responses] == [HTTPStatus.OK] * 5
    assert [r.url for r in endpoint.requests] == [httpx.URL(TOKEN_URL)] * 2


def test_async_refresh_works_on_several_event_loops(monkeypatch: pytest.MonkeyPatch) -> None:
    endpoint = _TokenEndpoint(expires_in=None)
    _route_provider_clients(monkeypatch, endpoint)
    provider = _provider()

    async def contended_refreshes() -> list[str]:
        return list(await asyncio.gather(*(provider.aget_token() for _ in range(3))))

    first_loop_tokens = asyncio.run(contended_refreshes())
    second_loop_tokens = asyncio.run(contended_refreshes())

    assert first_loop_tokens == ["token-1", "token-2", "token-3"]
    assert second_loop_tokens == ["token-4", "token-5", "token-6"]
