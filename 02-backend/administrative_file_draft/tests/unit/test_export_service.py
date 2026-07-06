"""Tests for the export service layer."""

from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from src.docx_export.converter import UnoConversionError
from src.services import export_service


class _FakeScalars:
    def __init__(self, nodes):
        self._nodes = nodes

    def all(self):
        return self._nodes


class _FakeResult:
    def __init__(self, nodes):
        self._nodes = nodes

    def scalars(self):
        return _FakeScalars(self._nodes)


@pytest.mark.asyncio
async def test_export_project_docx_uses_docx_converter(monkeypatch):
    async def _fake_generate_project_docx(project_id, db) -> bytes:
        return b"generated-docx"

    async def _fake_run_uno_conversion(converter, docx_bytes: bytes) -> bytes:
        assert converter is export_service.refresh_docx_with_unoserver
        assert docx_bytes == b"generated-docx"
        return b"converted-docx"

    monkeypatch.setattr(
        export_service,
        "_generate_project_docx",
        _fake_generate_project_docx,
    )
    monkeypatch.setattr(
        export_service,
        "_run_uno_conversion",
        _fake_run_uno_conversion,
    )

    result = await export_service.export_project_docx(uuid4(), SimpleNamespace())
    assert result == b"converted-docx"


@pytest.mark.asyncio
async def test_export_project_pdf_uses_pdf_converter(monkeypatch):
    async def _fake_generate_project_docx(project_id, db) -> bytes:
        return b"generated-docx"

    async def _fake_run_uno_conversion(converter, docx_bytes: bytes) -> bytes:
        assert converter is export_service.convert_docx_to_pdf_with_unoserver
        assert docx_bytes == b"generated-docx"
        return b"%PDF-fake"

    monkeypatch.setattr(
        export_service,
        "_generate_project_docx",
        _fake_generate_project_docx,
    )
    monkeypatch.setattr(
        export_service,
        "_run_uno_conversion",
        _fake_run_uno_conversion,
    )

    result = await export_service.export_project_pdf(uuid4(), SimpleNamespace())
    assert result == b"%PDF-fake"


@pytest.mark.asyncio
async def test_generate_project_docx_returns_generated_bytes(monkeypatch):
    nodes = [SimpleNamespace(id=uuid4())]
    project_metadata = export_service.ProjectExportMetadata(
        name="A42 Ausbau",
        internal_project_number="AZ-2026-042",
        latest_version=3,
    )

    async def _fake_run_sync(func):
        return func()

    def _fake_generate_docx(given_nodes, *, project_name, internal_project_number):
        assert given_nodes == nodes
        assert project_name == project_metadata.name
        assert internal_project_number == project_metadata.internal_project_number
        return b"generated-docx"

    async def _execute(statement):
        assert "vae_node.project_version = " in str(statement)
        return _FakeResult(nodes)

    async def _fake_fetch_project_export_metadata(project_id):
        return project_metadata

    db = SimpleNamespace(execute=_execute)

    monkeypatch.setattr(export_service.to_thread, "run_sync", _fake_run_sync)
    monkeypatch.setattr(
        export_service,
        "_fetch_project_export_metadata",
        _fake_fetch_project_export_metadata,
    )
    monkeypatch.setattr(export_service, "generate_vae_docx", _fake_generate_docx)

    result = await export_service._generate_project_docx(uuid4(), db)
    assert result == b"generated-docx"


@pytest.mark.asyncio
async def test_generate_project_docx_raises_404_when_no_nodes(monkeypatch):
    async def _execute(statement):
        return _FakeResult([])

    db = SimpleNamespace(execute=_execute)
    project_metadata = export_service.ProjectExportMetadata(
        name="A42 Ausbau",
        internal_project_number="AZ-2026-042",
        latest_version=3,
    )

    async def _fake_fetch_project_export_metadata(project_id):
        return project_metadata

    monkeypatch.setattr(
        export_service,
        "_fetch_project_export_metadata",
        _fake_fetch_project_export_metadata,
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_service._generate_project_docx(uuid4(), db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_generate_project_docx_raises_404_when_only_hidden_nodes(monkeypatch):
    hidden_node = SimpleNamespace(
        id=uuid4(),
        title="Hidden node",
        text="",
        order=0,
        parent_vae_node_id=None,
        is_hidden=True,
        is_deleted=False,
    )

    async def _execute(statement):
        if "vae_node.is_hidden IS false" in str(statement):
            return _FakeResult([])
        return _FakeResult([hidden_node])

    async def _fake_run_sync(func):
        pytest.fail("generate_vae_docx should not run without exportable nodes")

    async def _fake_fetch_project_export_metadata(project_id):
        return project_metadata

    db = SimpleNamespace(execute=_execute)
    project_metadata = export_service.ProjectExportMetadata(
        name="A42 Ausbau",
        internal_project_number="AZ-2026-042",
        latest_version=3,
    )

    monkeypatch.setattr(export_service.to_thread, "run_sync", _fake_run_sync)
    monkeypatch.setattr(
        export_service,
        "_fetch_project_export_metadata",
        _fake_fetch_project_export_metadata,
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_service._generate_project_docx(uuid4(), db)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail.startswith("No exportable VAE nodes found")


@pytest.mark.asyncio
async def test_run_uno_conversion_maps_uno_error_to_502(monkeypatch):
    async def _fake_run_sync(func):
        return func()

    def _converter(docx_bytes: bytes) -> bytes:
        raise UnoConversionError("LibreOffice DOCX conversion failed")

    monkeypatch.setattr(export_service.to_thread, "run_sync", _fake_run_sync)

    with pytest.raises(HTTPException) as exc_info:
        await export_service._run_uno_conversion(_converter, b"docx")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "LibreOffice DOCX conversion failed"


@pytest.mark.asyncio
async def test_run_uno_conversion_returns_bytes(monkeypatch):
    async def _fake_run_sync(func):
        return func()

    monkeypatch.setattr(export_service.to_thread, "run_sync", _fake_run_sync)

    result = await export_service._run_uno_conversion(lambda docx_bytes: b"converted", b"docx")
    assert result == b"converted"


@pytest.mark.asyncio
async def test_fetch_project_export_metadata_returns_name_and_internal_project_number(httpx_mock):
    project_id = uuid4()
    httpx_mock.add_response(
        url=f"{export_service.settings.PROJECT_LOGIC_SERVICE_URL}/projects/{project_id}",
        json={
            "name": "A42 Ausbau",
            "internalProjectNumber": "AZ-2026-042",
            "latestVersion": 3,
        },
    )

    result = await export_service._fetch_project_export_metadata(project_id)

    assert result == export_service.ProjectExportMetadata(
        name="A42 Ausbau",
        internal_project_number="AZ-2026-042",
        latest_version=3,
    )


@pytest.mark.asyncio
async def test_fetch_project_export_metadata_maps_request_error_to_502(monkeypatch):
    class _FailingAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url):
            raise httpx.RequestError("boom")

    monkeypatch.setattr(export_service.httpx, "AsyncClient", lambda timeout: _FailingAsyncClient())

    with pytest.raises(HTTPException) as exc_info:
        await export_service._fetch_project_export_metadata(uuid4())

    assert exc_info.value.status_code == 502
    assert "Could not reach project logic service" in exc_info.value.detail


@pytest.mark.asyncio
async def test_fetch_project_export_metadata_raises_502_when_internal_project_number_missing(httpx_mock):
    project_id = uuid4()
    httpx_mock.add_response(
        url=f"{export_service.settings.PROJECT_LOGIC_SERVICE_URL}/projects/{project_id}",
        json={
            "name": "A42 Ausbau",
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_service._fetch_project_export_metadata(project_id)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Project logic service response missing 'internalProjectNumber'"
