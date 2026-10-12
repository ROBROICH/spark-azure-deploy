# tests/utils/test_dms_utils.py
"""Tests for the DMS utilities module."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from temporal.project_context import use_project_context

from src.config import Config
from src.utils.dms_utils import (
    DmsConflictError,
    DmsUploadInput,
    FileObject,
    FileUploadArgs,
    ListFilesInput,
    _close_client,
    _get_client,
    delete_file,
    download_file,
    download_file_as_stream,
    get_file_metadata,
    list_all_files,
    list_files,
    upload_file_overwrite,
)

_PROJECT_ID = UUID("12345678-1234-5678-1234-567812345678")


def _listed_file(filename: str) -> MagicMock:
    file_obj = MagicMock()
    file_obj.id = uuid4()
    file_obj.filename = filename
    return file_obj


class TestCamelConfig:
    """Tests for CamelConfig model config."""

    def test_camel_case_alias_generation(self) -> None:
        """Tests that camelCase aliases are generated correctly."""
        args = FileUploadArgs(filename="test.pdf", project_id="123", type="document")
        # Can serialize with camelCase
        data = args.model_dump(by_alias=True)
        assert "projectId" in data or "project_id" in data


class TestFileObject:
    """Tests for the FileObject model."""

    def test_file_object_creation(self) -> None:
        """Tests that FileObject can be created with required fields."""
        file_obj = FileObject(
            id=UUID("12345678-1234-5678-1234-567812345678"),
            type="document",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="projects/123/documents/test.pdf",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert file_obj.filename == "test.pdf"
        assert str(file_obj.bucket_path) == "projects/123/documents/test.pdf"

    def test_file_object_with_optional_fields(self) -> None:
        """Tests FileObject with optional fields."""
        file_obj = FileObject(
            id=UUID("12345678-1234-5678-1234-567812345678"),
            type="content_extraction",
            filename="output.json",
            mime_type="application/json",
            bucket_path="projects/123/content_extraction/output.json",
            project_id=UUID("98765432-1234-5678-1234-567812345678"),
            workflow_id="workflow-123",
            run_id="run-456",
            vector_searchable=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert file_obj.workflow_id == "workflow-123"
        assert file_obj.vector_searchable is True


class TestFileUploadArgs:
    """Tests for the FileUploadArgs model."""

    def test_file_upload_args_creation(self) -> None:
        """Tests that FileUploadArgs can be created."""
        args = FileUploadArgs(filename="test.pdf", project_id="project-123", type="document")
        assert args.filename == "test.pdf"
        assert args.project_id == "project-123"


class TestGetClient:
    """Tests for the HTTP client singleton."""

    def test_get_client_creates_client(self) -> None:
        """Tests that _get_client creates a new client."""
        import src.utils.dms_utils as dms_module

        dms_module._client = None  # Reset singleton

        with patch("src.utils.dms_utils.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            result = _get_client()

            mock_client_class.assert_called_once()
            assert result is mock_client

        # Clean up
        dms_module._client = None

    def test_get_client_returns_singleton(self) -> None:
        """Tests that _get_client returns the same client on subsequent calls."""
        import src.utils.dms_utils as dms_module

        dms_module._client = None

        with patch("src.utils.dms_utils.httpx.AsyncClient") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            client1 = _get_client()
            client2 = _get_client()

            assert client1 is client2
            mock_client_class.assert_called_once()

        dms_module._client = None


class TestCloseClient:
    """Tests for closing the HTTP client."""

    @pytest.mark.asyncio
    async def test_close_client(self) -> None:
        """Tests that _close_client closes and clears the client."""
        import src.utils.dms_utils as dms_module

        mock_client = AsyncMock()
        dms_module._client = mock_client

        await _close_client()

        mock_client.aclose.assert_called_once()
        assert dms_module._client is None

    @pytest.mark.asyncio
    async def test_close_client_when_none(self) -> None:
        """Tests that _close_client handles None client gracefully."""
        import src.utils.dms_utils as dms_module

        dms_module._client = None

        # Should not raise
        await _close_client()

        assert dms_module._client is None


class TestGetFileMetadata:
    """Tests for the get_file_metadata function."""

    @pytest.mark.asyncio
    async def test_get_file_metadata_success(self) -> None:
        """Tests successful retrieval of file metadata."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "12345678-1234-5678-1234-567812345678",
            "type": "document",
            "filename": "test.pdf",
            "mimeType": "application/pdf",
            "bucketPath": "projects/123/documents/test.pdf",
            "createdAt": "2024-01-15T10:30:00Z",
            "updatedAt": "2024-01-15T10:30:00Z",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await get_file_metadata(UUID("12345678-1234-5678-1234-567812345678"))

        assert result.filename == "test.pdf"
        assert result.mime_type == "application/pdf"

    @pytest.mark.asyncio
    async def test_get_file_metadata_not_found(self) -> None:
        """Tests that FileNotFoundError is raised when file doesn't exist."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(FileNotFoundError):
                await get_file_metadata(UUID("00000000-0000-0000-0000-000000000000"))

    @pytest.mark.asyncio
    async def test_get_file_metadata_adds_project_version_from_temporal_context(self) -> None:
        """Scopes metadata lookups to the current Temporal project version."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "12345678-1234-5678-1234-567812345678",
            "type": "document",
            "filename": "test.pdf",
            "mimeType": "application/pdf",
            "bucketPath": "projects/123/documents/test.pdf",
            "projectVersion": 7,
            "createdAt": "2024-01-15T10:30:00Z",
            "updatedAt": "2024-01-15T10:30:00Z",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with (
            patch("src.utils.dms_utils._get_client", return_value=mock_client),
            use_project_context("project-123", 7),
        ):
            result = await get_file_metadata(UUID("12345678-1234-5678-1234-567812345678"))

        assert result.project_version == 7
        assert mock_client.get.call_args.kwargs["params"] == {"projectVersion": 7}


class TestDownloadFile:
    """Tests for the download_file function."""

    @pytest.mark.asyncio
    async def test_download_file_success(self) -> None:
        """Tests successful file download."""
        # First response: generate download URL
        mock_url_response = MagicMock()
        mock_url_response.status_code = 200
        mock_url_response.json.return_value = {"downloadUrl": "https://storage.example.com/signed-url"}

        # Second response: actual download
        mock_download_response = MagicMock()
        mock_download_response.status_code = 200
        mock_download_response.content = b"file content here"
        mock_download_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_url_response, mock_download_response])

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await download_file("file-123")

        assert result == b"file content here"

    @pytest.mark.asyncio
    async def test_download_file_not_found(self) -> None:
        """Tests that FileNotFoundError is raised when file doesn't exist."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(FileNotFoundError):
                await download_file("nonexistent-id")

    @pytest.mark.asyncio
    async def test_download_file_extracts_content_type_from_url(self) -> None:
        """Tests that content-type is extracted from signed URL if present."""
        mock_url_response = MagicMock()
        mock_url_response.status_code = 200
        mock_url_response.json.return_value = {
            "downloadUrl": "https://storage.example.com/file?response-content-type=application%2Fpdf"
        }

        mock_download_response = MagicMock()
        mock_download_response.status_code = 200
        mock_download_response.content = b"pdf content"
        mock_download_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_url_response, mock_download_response])

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await download_file("file-123")

        assert result == b"pdf content"

    @pytest.mark.asyncio
    async def test_download_file_adds_project_version_only_to_dms_request(self) -> None:
        """Scopes the signed-url request without leaking query params to object storage."""
        def handler(request: httpx.Request) -> httpx.Response:
            if (
                request.method == "GET"
                and request.url.path == "/v2/internal/files/file-123/generate-download-url"
                and dict(request.url.params) == {"projectVersion": "7"}
            ):
                return httpx.Response(
                    200, json={"downloadUrl": "https://storage.example.com/signed-url?signature=signed"}
                )
            if str(request.url) == "https://storage.example.com/signed-url?signature=signed":
                return httpx.Response(200, content=b"file content here")
            return httpx.Response(404)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with (
                patch("src.utils.dms_utils._get_client", return_value=client),
                use_project_context("project-123", 7),
            ):
                result = await download_file("file-123")

        assert result == b"file content here"


class TestListFiles:
    """Tests for the list_files function."""

    @pytest.mark.asyncio
    async def test_list_files_adds_project_version_from_temporal_context(self) -> None:
        """Scopes DMS file listings to the current Temporal project version."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = []

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with (
            patch("src.utils.dms_utils._get_client", return_value=mock_client),
            use_project_context("project-123", 7),
        ):
            result = await list_files(
                ListFilesInput(project_id=UUID("12345678-1234-5678-1234-567812345678"))
            )

        assert result == []
        assert mock_client.get.call_args.kwargs["params"]["projectVersion"] == 7


class TestListAllFiles:
    @pytest.mark.asyncio
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_returns_empty_when_first_page_empty(self, mock_list_files: AsyncMock) -> None:
        empty_page: list[FileObject] = []
        mock_list_files.return_value = empty_page

        result = await list_all_files(_PROJECT_ID, "document")

        assert result == []
        mock_list_files.assert_awaited_once()
        request = mock_list_files.await_args_list[0].args[0]
        assert (request.project_id, request.file_type, request.page, request.page_size) == (
            _PROJECT_ID,
            "document",
            1,
            500,
        )

    @pytest.mark.asyncio
    @patch("src.utils.dms_utils.get_config", return_value=Config(DMS_LIST_PAGE_SIZE=2))
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_paginates_until_partial_page(self, mock_list_files: AsyncMock, _mock_config: MagicMock) -> None:
        full_page = [_listed_file("doc0.pdf"), _listed_file("doc1.pdf")]
        partial_page = [_listed_file("last.pdf")]
        mock_list_files.side_effect = [full_page, partial_page]

        result = await list_all_files(_PROJECT_ID, "document")

        assert [f.filename for f in result] == ["doc0.pdf", "doc1.pdf", "last.pdf"]
        assert [c.args[0].page for c in mock_list_files.await_args_list] == [1, 2]

    @pytest.mark.asyncio
    @patch("src.utils.dms_utils.activity")
    @patch("src.utils.dms_utils.get_config", return_value=Config(DMS_LIST_PAGE_SIZE=1, DMS_LIST_MAX_PAGES=3))
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_stops_at_max_pages_with_warning(
        self, mock_list_files: AsyncMock, _mock_config: MagicMock, mock_activity: MagicMock
    ) -> None:
        mock_list_files.side_effect = lambda _input: [_listed_file(f"doc{_input.page}.pdf")]

        result = await list_all_files(_PROJECT_ID, "document")

        assert [f.filename for f in result] == ["doc1.pdf", "doc2.pdf", "doc3.pdf"]
        assert [c.args[0].page for c in mock_list_files.await_args_list] == [1, 2, 3]
        mock_activity.logger.warning.assert_called_once()


class TestUploadFileOverwrite:
    @pytest.mark.asyncio
    @patch("src.utils.dms_utils.activity")
    @patch("src.utils.dms_utils.delete_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.upload_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.get_config", return_value=Config(DMS_LIST_PAGE_SIZE=1))
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_finds_conflicting_file_beyond_first_page(
        self,
        mock_list_files: AsyncMock,
        _mock_config: MagicMock,
        mock_upload_file: AsyncMock,
        mock_delete_file: AsyncMock,
        _mock_activity: MagicMock,
    ) -> None:
        conflicting = _listed_file("doc/img.png")
        last_page: list[MagicMock] = []
        mock_list_files.side_effect = [[_listed_file("other.png")], [conflicting], last_page]
        uploaded = MagicMock()
        mock_upload_file.side_effect = [DmsConflictError("exists"), uploaded]

        result = await upload_file_overwrite(
            DmsUploadInput(data=b"png", filename="doc/img.png", project_id=_PROJECT_ID)
        )

        assert result is uploaded
        mock_delete_file.assert_awaited_once_with(conflicting.id)
        assert [c.args[0].filename for c in mock_upload_file.await_args_list] == ["doc/img.png", "doc/img.png"]


class TestDownloadFileAsStream:
    """Tests for download_file_as_stream function."""

    @pytest.mark.asyncio
    async def test_download_file_as_stream(self) -> None:
        """Tests that download_file_as_stream returns BytesIO."""
        with patch("src.utils.dms_utils.download_file", new_callable=AsyncMock) as mock_download:
            mock_download.return_value = b"stream content"

            result = await download_file_as_stream("file-123")

            assert result.read() == b"stream content"


class TestDeleteFile:
    """Tests for the delete_file function."""

    @pytest.mark.asyncio
    async def test_delete_file_success(self) -> None:
        """Tests successful file deletion."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.delete = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            # Should not raise
            await delete_file(UUID("12345678-1234-5678-1234-567812345678"))

        mock_client.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_file_idempotent_on_404(self) -> None:
        """Tests that delete is idempotent (no error on 404)."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        mock_client = AsyncMock()
        mock_client.delete = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            # Should not raise even for 404
            await delete_file(UUID("00000000-0000-0000-0000-000000000000"))
