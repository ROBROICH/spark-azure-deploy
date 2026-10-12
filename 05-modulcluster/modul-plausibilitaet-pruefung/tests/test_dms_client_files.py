"""DMSClient tests for file listing and download behavior."""

import json

import httpx
import pytest
from temporal.project_context import use_project_context

from src.dms.dms_client import DMSClient

from .conftest import TransportInstaller


class TestDMSClientFiles:
    @pytest.mark.asyncio
    async def test_list_files_paginates_until_short_page(self, install_transport: TransportInstaller) -> None:
        from src.config.config import config  # noqa: PLC0415

        page_size = config.DMS.PAGE_SIZE
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(str(request.url))
            page = int(request.url.params["page"])
            if page == 1:
                body = [
                    {"id": f"f{i}", "type": "file", "filename": f"a{i}.json", "bucketPath": "/b", "projectId": "p"}
                    for i in range(page_size)
                ]
            else:
                body = [{"id": "fX", "type": "file", "filename": "tail.json", "bucketPath": "/b", "projectId": "p"}]
            return httpx.Response(200, json=body)

        install_transport(handler)
        result = await DMSClient().list_files(project_id="p")

        assert len(result) == page_size + 1
        assert len(calls) == 2  # noqa: PLR2004

    @pytest.mark.asyncio
    async def test_list_files_adds_project_version_from_temporal_context(
        self, install_transport: TransportInstaller
    ) -> None:
        seen: list[httpx.URL] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.url)
            return httpx.Response(200, json=[])

        install_transport(handler)
        with use_project_context("p", 3):
            result = await DMSClient().list_files(project_id="p")

        assert result == []
        assert seen[0].params["projectVersion"] == "3"

    @pytest.mark.asyncio
    async def test_get_download_url_adds_project_version_from_temporal_context(
        self, install_transport: TransportInstaller
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if (
                request.method == "GET"
                and request.url.path == "/v2/internal/files/file-1/generate-download-url"
                and dict(request.url.params) == {"projectVersion": "4"}
            ):
                return httpx.Response(200, json={"downloadUrl": "https://example/dl/abc"})
            return httpx.Response(404)

        install_transport(handler)
        with use_project_context("p", 4):
            url = await DMSClient().get_download_url("file-1")

        assert url == "https://example/dl/abc"

    @pytest.mark.asyncio
    async def test_download_json_parses_via_tempfile(self, install_transport: TransportInstaller) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/generate-download-url"):
                return httpx.Response(200, json={"downloadUrl": "https://example/dl/abc"})
            return httpx.Response(200, text=json.dumps({"hello": "world"}))

        install_transport(handler)
        result = await DMSClient().download_json("f1")

        assert result == {"hello": "world"}

    @pytest.mark.asyncio
    async def test_fetch_erlauterungsbericht_picks_best_confidence(self, install_transport: TransportInstaller) -> None:
        classification = {
            "matchedDocumentTypes": [
                {
                    "requiredDocumentType": {
                        "documentTypeName": "Other",
                        "documentTypeDescription": "Other document",
                    },
                    "assignedDocuments": [
                        {
                            "documentId": "x",
                            "documentName": "other.pdf",
                            "documentExtractionId": "extraction-x",
                            "reasoning": "Other type",
                            "confidence": 0.9,
                        }
                    ],
                    "confidence": 0.9,
                },
                {
                    "requiredDocumentType": {
                        "documentTypeName": "Erläuterungsbericht",
                        "documentTypeDescription": "Project report",
                    },
                    "assignedDocuments": [
                        {
                            "documentId": "low",
                            "documentName": "low.pdf",
                            "documentExtractionId": "extraction-low",
                            "reasoning": "Candidate",
                            "confidence": 0.3,
                        },
                        {
                            "documentId": "high",
                            "documentName": "high.pdf",
                            "documentExtractionId": "extraction-high",
                            "reasoning": "Best candidate",
                            "confidence": 0.95,
                        },
                    ],
                    "confidence": 0.95,
                },
            ],
            "unassignedDocuments": [],  # pyrefly: ignore[implicit-any-empty-container]
        }

        def handler(request: httpx.Request) -> httpx.Response:
            if "generate-download-url" in request.url.path:
                return httpx.Response(200, json={"downloadUrl": "https://example/dl"})
            return httpx.Response(200, text=json.dumps(classification))

        install_transport(handler)
        result = await DMSClient().fetch_erlauterungsbericht_document_ids("cls-1")

        assert result == ["high"]

    @pytest.mark.asyncio
    async def test_fetch_erlauterungsbericht_returns_empty_when_no_match(
        self, install_transport: TransportInstaller
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if "generate-download-url" in request.url.path:
                return httpx.Response(200, json={"downloadUrl": "https://example/dl"})
            return httpx.Response(200, text=json.dumps({"matchedDocumentTypes": [], "unassignedDocuments": []}))

        install_transport(handler)

        assert await DMSClient().fetch_erlauterungsbericht_document_ids("cls-1") == []
