from pathlib import Path

import httpx
import pytest
from db_services_shared.utils.docling import DoclingConfig, docling_auth, pdf_to_doc

TOKEN_URL = "https://keycloak.example.com/realms/master/protocol/openid-connect/token"


def _config(token_url: str | None) -> DoclingConfig:
    return DoclingConfig.model_validate(
        {
            "HOST": "https://docling.example.com",
            "TOKEN_URL": token_url,
            "CLIENT_ID": "docling-consumer",
            "CLIENT_SECRET": "s3cret",
        }
    )


def _route_clients(monkeypatch: pytest.MonkeyPatch, seen: list[tuple[str, str | None]], accepted: set[str]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers.get("Authorization")))
        if str(request.url) == TOKEN_URL:
            token_number = sum(1 for path, _ in seen if path == request.url.path)
            return httpx.Response(200, json={"access_token": f"token-{token_number}", "expires_in": 300})
        if request.headers.get("Authorization") not in {f"Bearer {token}" for token in accepted}:
            return httpx.Response(401)
        return httpx.Response(200, json={"status": "success", "document": {"md_content": "text"}})

    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))


def test_no_auth_without_credentials() -> None:
    assert docling_auth(DoclingConfig(TOKEN_URL=None)) is None


def test_rejects_http_token_url() -> None:
    with pytest.raises(ValueError, match="must use HTTPS"):
        docling_auth(_config("http://token-endpoint.test/token"))


def test_token_is_cached_across_documents(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    seen: list[tuple[str, str | None]] = []
    _route_clients(monkeypatch, seen, accepted={"token-1"})
    cfg = _config(TOKEN_URL)
    auth = docling_auth(cfg)
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF")

    assert pdf_to_doc(pdf, cfg, auth).export_to_markdown() == "text"
    assert pdf_to_doc(pdf, cfg, auth).export_to_markdown() == "text"

    assert seen == [
        ("/realms/master/protocol/openid-connect/token", None),
        ("/v1/convert/file", "Bearer token-1"),
        ("/v1/convert/file", "Bearer token-1"),
    ]


def test_rejected_token_is_refreshed_and_conversion_retried_once(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    seen: list[tuple[str, str | None]] = []
    _route_clients(monkeypatch, seen, accepted={"token-2"})
    cfg = _config(TOKEN_URL)
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF")

    assert pdf_to_doc(pdf, cfg, docling_auth(cfg)).export_to_markdown() == "text"

    assert seen == [
        ("/realms/master/protocol/openid-connect/token", None),
        ("/v1/convert/file", "Bearer token-1"),
        ("/realms/master/protocol/openid-connect/token", None),
        ("/v1/convert/file", "Bearer token-2"),
    ]


def test_second_401_propagates(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    seen: list[tuple[str, str | None]] = []
    _route_clients(monkeypatch, seen, accepted=set())
    cfg = _config(TOKEN_URL)
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF")

    with pytest.raises(httpx.HTTPStatusError):
        pdf_to_doc(pdf, cfg, docling_auth(cfg))

    assert [header for path, header in seen if path == "/v1/convert/file"] == ["Bearer token-1", "Bearer token-2"]
