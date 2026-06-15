"""DMSClient tests for upload and checkpoint behavior."""

import httpx
import pytest
from temporal.project_context import use_project_context

from src.dms.dms_client import DMSClient

from .conftest import TransportInstaller


def _confirmed_upload(filename: str = "f.json") -> dict[str, str]:
    return {
        "id": "uploaded-id",
        "type": "file",
        "filename": filename,
        "bucketPath": "/b",
        "projectId": "p",
    }


class TestDMSClientUploads:
    @pytest.mark.asyncio
    async def test_upload_file_and_temporal_checkpoint(self, install_transport: TransportInstaller) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path
            if path.endswith("/generate-upload-url"):
                return httpx.Response(200, json={
                    "uploadUrl": "https://example/upload",
                    "mimeType": "application/json",
                })
            if path.endswith("/upload"):
                return httpx.Response(200)
            if path.endswith("/confirm-upload"):
                return httpx.Response(200, json=_confirmed_upload())
            return httpx.Response(404)

        install_transport(handler)
        result = await DMSClient().upload_temporal_checkpoint(
            project_id="p", workflow_id="w", run_id="r",
            filename="f.json", payload={"x": 1},
        )

        assert result.id == "uploaded-id"

    @pytest.mark.asyncio
    async def test_upload_file_adds_project_version_from_temporal_context(
        self, install_transport: TransportInstaller
    ) -> None:
        seen: list[httpx.URL] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.url)
            path = request.url.path
            if path.endswith("/generate-upload-url"):
                return httpx.Response(200, json={
                    "uploadUrl": "https://example/upload",
                    "mimeType": "application/json",
                })
            if path.endswith("/upload"):
                return httpx.Response(200)
            if path.endswith("/confirm-upload"):
                return httpx.Response(200, json=_confirmed_upload())
            return httpx.Response(404)

        install_transport(handler)
        with use_project_context("p", 5):
            result = await DMSClient().upload_file(
                project_id="p",
                filename="f.json",
                payload={"x": 1},
            )

        versioned_urls = [
            url for url in seen
            if url.path.endswith("/generate-upload-url") or url.path.endswith("/confirm-upload")
        ]
        assert result.id == "uploaded-id"
        assert [url.params["project_version"] for url in versioned_urls] == ["5", "5"]
