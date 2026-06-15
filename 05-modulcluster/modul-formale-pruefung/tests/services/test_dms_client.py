from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporal.project_context import use_project_context
from temporal.workflows.formale_pruefung import DMSFileResponse

from src.schemas.dms_schemas import DMSDocument
from src.services.dms_client import DMSClient


@pytest.mark.asyncio
async def test_get_dms_documents_matches_files():
    """
    Verifies that a document is correctly matched
    with its corresponding content extraction file based on naming conventions.
    """
    client = DMSClient()
    with patch.object(client, "list_files", new_callable=AsyncMock) as mock_list_files:
        mock_list_files.side_effect = [
            [
                DMSFileResponse(
                    id="doc-id-123",
                    filename="invoices/inv_A.pdf",
                    type="document",
                    bucketPath="/",
                    projectId="p1",
                )
            ],
            [
                DMSFileResponse(
                    id="ext-id-456",
                    filename="invoices/inv_A/inv_A_processed.json",
                    type="content_extraction",
                    bucketPath="/",
                    projectId="p1",
                )
            ],
        ]
        matched_documents = await client.get_dms_documents(project_id="p1")
        assert len(matched_documents) == 1
        assert matched_documents[0].content_extraction_id == "ext-id-456"


@pytest.mark.asyncio
async def test_get_extraction_data_filters_by_page():
    """
    Ensures that content chunks are correctly
    filtered out based on the 'n_pages' parameter.
    """
    client = DMSClient()
    mock_doc = DMSDocument(
        project_id="p1",
        document_id="doc-1",
        document_name="test.pdf",
        content_extraction_id="ext1",
    )
    with patch.object(client, "download_json", new_callable=AsyncMock) as mock_download:
        mock_download.return_value = {
            "chunks": [
                {
                    "chunk_id": "c1",
                    "page_content": "...",
                    "metadata": {"page_numbers": [1]},
                },
                {
                    "chunk_id": "c2",
                    "page_content": "...",
                    "metadata": {"page_numbers": [2]},
                },
                {
                    "chunk_id": "c3",
                    "page_content": "...",
                    "metadata": {"page_numbers": [3]},
                },
            ],
            "metadata": {"document_id": "doc-1", "summary": ""},
        }
        result = await client.get_extraction_data(mock_doc, n_pages=2)
        assert len(result.chunks) == 2


@pytest.mark.asyncio
async def test_upload_file_orchestrates_calls():
    """
    Checks that the upload process correctly
    orchestrates the API calls for generating a URL and confirming the upload.
    """
    client = DMSClient()
    with (
        patch.object(client, "_request", new_callable=AsyncMock) as mock_request,
        patch("httpx.AsyncClient.put", new_callable=AsyncMock) as mock_put,
    ):
        mock_response = MagicMock()
        mock_put.return_value = mock_response
        mock_request.side_effect = [
            {"uploadUrl": "httpInvalid://fake.url"},
            {
                "id": "new-file-id",
                "filename": "f.json",
                "type": "document",
                "bucketPath": "/",
                "projectId": "p1",
            },
        ]
        await client.upload_file("p1", "f.json", payload="{}")
        assert mock_request.call_count == 2


@pytest.mark.asyncio
async def test_upload_file_adds_project_version_from_temporal_context():
    client = DMSClient()
    with (
        patch.object(client, "_request", new_callable=AsyncMock) as mock_request,
        patch("httpx.AsyncClient.put", new_callable=AsyncMock) as mock_put,
    ):
        mock_response = MagicMock()
        mock_put.return_value = mock_response
        mock_request.side_effect = [
            {"uploadUrl": "httpInvalid://fake.url"},
            {
                "id": "new-file-id",
                "filename": "f.json",
                "type": "document",
                "bucketPath": "/",
                "projectId": "p1",
            },
        ]

        with use_project_context("p1", 7):
            await client.upload_file("p1", "f.json", payload="{}")

        assert mock_request.await_args_list[0].kwargs["params"] == {"project_version": 7}
        assert mock_request.await_args_list[1].kwargs["params"] == {"project_version": 7}


@pytest.mark.asyncio
async def test_list_files_handles_pagination_end():
    """
    Verifies the file listing loop terminates
    correctly when the API returns an empty list of files.
    """
    client = DMSClient()
    # Mock the internal request to simulate API responses
    with patch.object(client, "_request", new_callable=AsyncMock) as mock_request:
        # First call returns one file, the second returns empty, ending the loop
        mock_request.side_effect = [
            # The response must be a dictionary that can be parsed by DMSFileResponse
            [
                {
                    "id": "file1",
                    "filename": "test.pdf",
                    "type": "document",
                    "bucketPath": "/",
                    "projectId": "p1",
                }
            ],
            [],
        ]
        files = await client.list_files(project_id="p1")
        assert len(files) == 1
        assert mock_request.call_count == 1


@pytest.mark.asyncio
async def test_list_files_adds_project_version_from_temporal_context():
    client = DMSClient()
    with patch.object(client, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = []

        with use_project_context("p1", 3):
            await client.list_files(project_id="p1")

        params = mock_request.await_args.kwargs["params"]
        assert params["project_version"] == 3
        assert params["projectId"] == "p1"


@pytest.mark.asyncio
async def test_get_download_url_adds_project_version_from_temporal_context():
    client = DMSClient()
    with patch.object(client, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"downloadUrl": "https://example.test/file"}

        with use_project_context("p1", 4):
            download_url = await client.get_download_url("file1")

        assert download_url == "https://example.test/file"
        assert mock_request.await_args.kwargs["params"] == {"project_version": 4}
