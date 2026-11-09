"""cli testing"""
import io
import zipfile
from pathlib import Path

import httpx
import pytest
import respx
from httpx import Response
from jura_db import cli
from jura_db.cli import app, download_document
from jura_db.config import app_config

SAMPLE_DOC = "jb-TESTDOC0001"


def _sample_document_zip() -> bytes:
    """Zip the committed sample XML the way the RII portal serves it."""
    xml = (Path("tests/data") / SAMPLE_DOC / f"{SAMPLE_DOC}.xml").read_bytes()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{SAMPLE_DOC}.xml", xml)
    return buffer.getvalue()


@respx.mock
def test_cli_main(cli_client, mock_query_embedding):
    """main should download (stubbed), parse and persist a document."""
    respx.get(f"{app_config.rii_base_document_url}/{SAMPLE_DOC}.zip").mock(
        return_value=Response(200, content=_sample_document_zip())
    )

    result = cli_client.invoke(app, ["main", SAMPLE_DOC, "--overwrite"])

    assert result.exit_code == 0, result.output
    assert "Document processing completed successfully" in result.output


@respx.mock
def test_cli_main_reports_download_failure(cli_client, mock_query_embedding):
    """A missing document upstream should fail the command, not pass silently."""
    respx.get(f"{app_config.rii_base_document_url}/{SAMPLE_DOC}.zip").mock(
        return_value=Response(404)
    )

    result = cli_client.invoke(app, ["main", SAMPLE_DOC, "--overwrite"])

    assert result.exit_code != 0


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
