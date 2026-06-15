"""Tests for the DOCX export API route."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.api.routes import export_api


@pytest.mark.asyncio
async def test_export_vae_docx_returns_converted_docx(monkeypatch):
    db = SimpleNamespace()

    async def _fake_export_docx(project_id, given_db) -> bytes:
        assert given_db is db
        return b"converted-docx"

    monkeypatch.setattr(
        export_api.export_service,
        "export_project_docx",
        _fake_export_docx,
    )

    response = await export_api.export_vae_docx(uuid4(), db)

    assert response.body == b"converted-docx"
    assert response.media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert response.headers["Content-Disposition"].endswith(".docx")


@pytest.mark.asyncio
async def test_export_vae_docx_propagates_http_exception(monkeypatch):
    db = SimpleNamespace()

    async def _fake_export_docx(project_id, given_db) -> bytes:
        raise HTTPException(status_code=404, detail="No VAE nodes found")

    monkeypatch.setattr(
        export_api.export_service,
        "export_project_docx",
        _fake_export_docx,
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_api.export_vae_docx(uuid4(), db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_export_vae_pdf_returns_converted_pdf(monkeypatch):
    db = SimpleNamespace()

    async def _fake_export_pdf(project_id, given_db) -> bytes:
        assert given_db is db
        return b"%PDF-fake"

    monkeypatch.setattr(
        export_api.export_service,
        "export_project_pdf",
        _fake_export_pdf,
    )

    response = await export_api.export_vae_pdf(uuid4(), db)

    assert response.body == b"%PDF-fake"
    assert response.media_type == "application/pdf"
    assert response.headers["Content-Disposition"].endswith(".pdf")


@pytest.mark.asyncio
async def test_export_vae_pdf_propagates_http_exception(monkeypatch):
    db = SimpleNamespace()

    async def _fake_export_pdf(project_id, given_db) -> bytes:
        raise HTTPException(status_code=502, detail="LibreOffice PDF conversion failed")

    monkeypatch.setattr(
        export_api.export_service,
        "export_project_pdf",
        _fake_export_pdf,
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_api.export_vae_pdf(uuid4(), db)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "LibreOffice PDF conversion failed"
