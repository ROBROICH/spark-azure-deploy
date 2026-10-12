from collections.abc import Iterator
from unittest.mock import MagicMock, patch

import httpx
import pytest
from authentification.client_credentials import ClientCredentialsTokenProvider
from pydantic import SecretStr

from src.providers.docling.api_client import DoclingApiClient
from src.utils.keycloak_token import get_keycloak_token_provider

TOKEN_URL = "https://kc.example.com/token"


@pytest.fixture(autouse=True)
def _fresh_provider() -> Iterator[None]:
    get_keycloak_token_provider.cache_clear()
    yield
    get_keycloak_token_provider.cache_clear()


def _env(client_id: str, client_secret: str, token_url: str) -> MagicMock:
    mock_env = MagicMock()
    mock_env.OIDC_CLIENT_ID = client_id
    mock_env.OIDC_CLIENT_SECRET = SecretStr(client_secret)
    mock_env.OIDC_TOKEN_URL = token_url
    return mock_env


class TestGetKeycloakTokenProvider:
    def test_returns_none_when_not_configured(self) -> None:
        with patch("src.utils.keycloak_token.ENV", _env("", "", "")):
            assert get_keycloak_token_provider() is None

    def test_creates_provider_when_configured(self) -> None:
        with patch("src.utils.keycloak_token.ENV", _env("my-client", "my-secret", TOKEN_URL)):
            result = get_keycloak_token_provider()

        assert isinstance(result, ClientCredentialsTokenProvider)
        assert result.client_id == "my-client"
        assert result.token_url == TOKEN_URL

    def test_returns_cached_instance(self) -> None:
        with patch("src.utils.keycloak_token.ENV", _env("my-client", "my-secret", TOKEN_URL)):
            assert get_keycloak_token_provider() is get_keycloak_token_provider()

    def test_raises_on_http_token_url(self) -> None:
        with (
            patch("src.utils.keycloak_token.ENV", _env("my-client", "my-secret", "http://kc.example.com/token")),
            pytest.raises(ValueError, match="must use HTTPS"),
        ):
            get_keycloak_token_provider()


class TestDoclingRequestsUseProvider:
    async def test_rejected_token_is_refreshed_and_submit_retried_once(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[tuple[str, str | None]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append((request.url.path, request.headers.get("Authorization")))
            if str(request.url) == TOKEN_URL:
                token_number = sum(1 for path, _ in seen if path == "/token")
                return httpx.Response(200, json={"access_token": f"token-{token_number}", "expires_in": 300})
            if request.headers.get("Authorization") != "Bearer token-2":
                return httpx.Response(401)
            return httpx.Response(200, json={"task_id": "abc-123"})

        real_async_client = httpx.AsyncClient
        monkeypatch.setattr(
            httpx,
            "AsyncClient",
            lambda **kwargs: real_async_client(transport=httpx.MockTransport(handler), **kwargs),
        )
        api = DoclingApiClient(base_url="http://docling:5001", timeout=60)

        with (
            patch("src.utils.keycloak_token.ENV", _env("my-client", "my-secret", TOKEN_URL)),
            patch("src.providers.docling.api_client.get_config") as mock_config,
        ):
            mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
            task_id = await api.submit_document(b"%PDF", "a.pdf")

        assert task_id == "abc-123"
        assert seen == [
            ("/token", None),
            ("/v1/convert/file/async", "Bearer token-1"),
            ("/token", None),
            ("/v1/convert/file/async", "Bearer token-2"),
        ]
