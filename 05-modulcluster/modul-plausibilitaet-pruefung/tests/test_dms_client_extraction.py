"""DMSClient tests for extraction-file mapping and filtered chunk loading."""

import json
from typing import Any

import httpx
import pytest

from src.dms.dms_client import DMSClient
from src.dms.schemas import DMSDocument

from .conftest import TransportInstaller


class TestDMSClientExtraction:
    @pytest.mark.asyncio
    async def test_get_dms_documents_pairs_processed_json_files(
        self, install_transport: TransportInstaller
    ) -> None:
        responses: dict[str, list[dict[str, Any]]] = {
            "document": [
                {"id": "d1", "type": "file", "filename": "folder/report.pdf",
                 "bucketPath": "/b", "projectId": "p"},
            ],
            "content_extraction": [
                {"id": "ce1", "type": "file",
                 "filename": "folder/report/report_processed.json",
                 "bucketPath": "/b", "projectId": "p"},
            ],
        }

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=responses[request.url.params["file_type"]])

        install_transport(handler)
        result = await DMSClient().get_dms_documents("p")

        assert len(result) == 1
        assert result[0].document_id == "d1"
        assert result[0].content_extraction_id == "ce1"

    @pytest.mark.asyncio
    async def test_get_extraction_data_filters_by_page(self, install_transport: TransportInstaller) -> None:
        details: dict[str, Any] = {
            "metadata": {"document_id": "d1", "title": "report.pdf"},
            "chunks": [
                {
                    "chunk_id": "c1",
                    "parent_chunk_id": None,
                    "page_content": "parent",
                    "metadata": {"page_numbers": []},
                    "sub_chunks": [
                        {
                            "chunk_id": "s1", "parent_chunk_id": "c1",
                            "page_content": "p1", "sub_chunks": [],
                            "metadata": {"page_numbers": [1]},
                        },
                        {
                            "chunk_id": "s2", "parent_chunk_id": "c1",
                            "page_content": "p5", "sub_chunks": [],
                            "metadata": {"page_numbers": [5]},
                        },
                    ],
                }
            ],
        }

        def handler(request: httpx.Request) -> httpx.Response:
            if "generate-download-url" in request.url.path:
                return httpx.Response(200, json={"downloadUrl": "https://example/dl"})
            return httpx.Response(200, text=json.dumps(details))

        install_transport(handler)
        result = await DMSClient().get_extraction_data(
            DMSDocument(
                project_id="p", document_id="d1",
                document_name="report.pdf", content_extraction_id="ce1",
            ),
            n_pages=3,
        )

        assert len(result.chunks) == 1
        assert result.chunks[0].chunk_id == "s1"
