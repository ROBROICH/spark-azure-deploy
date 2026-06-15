"""DMSClient tests for project and document metadata behavior."""

import json

import httpx
import pytest

from src.dms.dms_client import DMSClient
from src.dms.schemas import ProjectBaseMetadataStatus

from .conftest import TransportInstaller


def _summary_file_response() -> dict[str, str]:
    return {
        "id": "summary-id",
        "type": "file",
        "filename": "summary.json",
        "bucketPath": "/b",
        "projectId": "p",
    }


class TestDMSClientMetadata:
    @pytest.mark.asyncio
    async def test_get_project_base_metadata_returns_metadata(self, install_transport: TransportInstaller) -> None:
        base_md = {
            "application_id": "p",
            "processing_timestamp": "2024-01-01T00:00:00Z",
        }
        summary_payload = {"base_metadata": base_md}

        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            if path.endswith("/v2/files"):
                return httpx.Response(200, json=[_summary_file_response()])
            if "generate-download-url" in path:
                return httpx.Response(200, json={"downloadUrl": "https://example/dl"})
            return httpx.Response(200, text=json.dumps(summary_payload))

        install_transport(handler)
        md, status = await DMSClient().get_project_base_metadata("p")

        assert status == ProjectBaseMetadataStatus.COMPLETE
        assert md.application_id == "p"

    @pytest.mark.asyncio
    async def test_get_project_base_metadata_falls_back_when_missing(
        self, install_transport: TransportInstaller
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            if path.endswith("/v2/files"):
                return httpx.Response(200, json=[_summary_file_response()])
            if "generate-download-url" in path:
                return httpx.Response(200, json={"downloadUrl": "https://example/dl"})
            return httpx.Response(200, text=json.dumps({"something_else": True}))

        install_transport(handler)
        _, status = await DMSClient().get_project_base_metadata("p")

        assert status == ProjectBaseMetadataStatus.FALLBACK_MISSING

    @pytest.mark.asyncio
    async def test_get_project_base_metadata_raises_when_summary_count_wrong(
        self, install_transport: TransportInstaller
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/v2/files"):
                return httpx.Response(200, json=[])
            return httpx.Response(200, json={})

        install_transport(handler)

        with pytest.raises(ValueError, match="summary files"):
            await DMSClient().get_project_base_metadata("p")

    @pytest.mark.asyncio
    async def test_get_document_metadata_matches_id(self, install_transport: TransportInstaller) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[
                {"id": "doc-1", "type": "file", "filename": "report.pdf",
                 "bucketPath": "/b", "projectId": "p"},
                {"id": "doc-2", "type": "file", "filename": "other.pdf",
                 "bucketPath": "/b", "projectId": "p"},
            ])

        install_transport(handler)
        md = await DMSClient().get_document_metadata("p", "doc-2")

        assert md.title == "other.pdf"

    @pytest.mark.asyncio
    async def test_get_document_metadata_raises_when_not_found(
        self, install_transport: TransportInstaller
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[])

        install_transport(handler)

        with pytest.raises(ValueError, match="not found"):
            await DMSClient().get_document_metadata("p", "missing")
