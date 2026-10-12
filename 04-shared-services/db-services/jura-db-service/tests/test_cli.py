"""cli testing"""
import httpx
import pytest
from jura_db import cli
from jura_db.cli import app, download_document
from jura_db.config import app_config


@pytest.mark.skip("errors in ci only")
def test_cli_main(cli_client):
    """Test the main CLI command with a cached sample document name."""
    result = cli_client.invoke(
        app, ["main", "jb-TESTDOC0001"]
    )
    assert result.exit_code == 0
    assert "Document processing completed successfully" in result.output


def test_resolve_toc_path_exists(cli_client):
    """Test that the TOC is downloaded and cached correctly."""
    # Ensure the cache directory is set to a test path
    result = cli_client.invoke(app, ["download-toc"])
    assert result.exit_code == 0
    assert "TOC downloaded successfully" in result.output


def test_download_document_rejects_plain_http(tmp_path, monkeypatch):
    """archives must only be fetched over TLS"""
    calls = []
    monkeypatch.setattr(httpx, "get", lambda *args, **_kwargs: calls.append(args))

    with pytest.raises(ValueError, match="https"):
        download_document("http://rechtsprechung.test/docs/jb-X.zip", tmp_path)

    assert calls == []


def test_toc_document_is_fetched_from_https_base_url(tmp_path, monkeypatch):
    """TOC entries link via plain http, the download must not follow that scheme"""
    links = []

    def _stop_download(link, _output_dir):
        links.append(link)
        raise httpx.HTTPError("stop after link resolution")

    monkeypatch.setattr(cli, "_resolve_toc_path", lambda: tmp_path / "rii-toc.xml")
    monkeypatch.setattr(
        cli,
        "get_toc_item",
        lambda _toc_path, _index: {
            "gericht": "Testgericht",
            "entsch_datum": "20260101",
            "aktenzeichen": "TEST-0001",
            "link": "http://rechtsprechung.test/docs/jb-X.zip",
            "modified": "2026-01-01",
        },
    )
    monkeypatch.setattr(cli, "download_document", _stop_download)

    with pytest.raises(httpx.HTTPError):
        cli.process_document("0")

    assert links == [f"{app_config.rii_base_document_url}/jb-X.zip"]
    assert links[0].startswith("https://")
