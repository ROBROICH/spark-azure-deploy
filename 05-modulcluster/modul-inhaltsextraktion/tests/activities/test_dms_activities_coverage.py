# tests/activities/test_dms_activities_coverage.py
"""
Tests for DMS activity definitions and helper methods:
- DmsFileInfo.from_file_object
- Activity definitions (_download_file_activity, etc.)
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.activities.dms_activities import (
    DmsFileInfo,
    DmsUploadResult,
    _delete_file_activity,
    _download_file_activity,
    _get_file_metadata_activity,
    _list_files_activity,
    _upload_file_activity,
)
from src.utils.dms_utils import DmsUploadInput, ListFilesInput


class TestDmsFileInfoFromFileObject:
    """Tests for DmsFileInfo.from_file_object class method."""

    def test_converts_file_object(self) -> None:
        """Test that a file object is correctly converted to DmsFileInfo."""
        file_id = uuid4()
        obj = MagicMock()
        obj.id = file_id
        obj.filename = "test.pdf"
        obj.mime_type = "application/pdf"
        obj.bucket_path = "projects/p1/test.pdf"

        result = DmsFileInfo.from_file_object(obj)

        assert result.file_id == str(file_id)
        assert result.filename == "test.pdf"
        assert result.mime_type == "application/pdf"
        assert result.bucket_path == "projects/p1/test.pdf"


@pytest.mark.asyncio
class TestDmsActivityDefinitions:
    """Tests for DMS activity definition wrappers."""

    @patch("src.activities.dms_activities.download_file", new_callable=AsyncMock)
    async def test_download_file_activity(self, mock_download: Any) -> None:
        """Test that _download_file_activity delegates to download_file."""
        file_id = uuid4()
        mock_download.return_value = b"file-content"

        result = await _download_file_activity(file_id)

        assert result == b"file-content"
        mock_download.assert_awaited_once_with(file_id)

    @patch("src.activities.dms_activities.get_file_metadata", new_callable=AsyncMock)
    async def test_get_file_metadata_activity(self, mock_get_metadata: Any) -> None:
        """Test that _get_file_metadata_activity returns a DmsFileInfo."""
        file_id = uuid4()
        obj = MagicMock()
        obj.id = file_id
        obj.filename = "doc.pdf"
        obj.mime_type = "application/pdf"
        obj.bucket_path = "projects/p1/doc.pdf"
        mock_get_metadata.return_value = obj

        result = await _get_file_metadata_activity(file_id)

        assert isinstance(result, DmsFileInfo)
        assert result.filename == "doc.pdf"

    @patch("src.activities.dms_activities.upload_file", new_callable=AsyncMock)
    async def test_upload_file_activity(self, mock_upload: Any) -> None:
        """Test that _upload_file_activity returns a DmsUploadResult."""
        file_id = uuid4()
        obj = MagicMock()
        obj.id = file_id
        obj.filename = "uploaded.json"
        obj.bucket_path = "projects/p1/uploaded.json"
        mock_upload.return_value = obj

        input_data = DmsUploadInput(
            data=b"content",
            filename="uploaded.json",
            project_id=uuid4(),
            file_type="content_extraction",
            content_type="application/json",
        )
        result = await _upload_file_activity(input_data)

        assert isinstance(result, DmsUploadResult)
        assert result.file_id == file_id
        assert result.filename == "uploaded.json"

    @patch("src.activities.dms_activities.list_files", new_callable=AsyncMock)
    async def test_list_files_activity(self, mock_list: Any) -> None:
        """Test that _list_files_activity returns a list of DmsFileInfo."""
        obj = MagicMock()
        obj.id = uuid4()
        obj.filename = "test.pdf"
        obj.mime_type = "application/pdf"
        obj.bucket_path = "test/test.pdf"
        mock_list.return_value = [obj]

        input_data = ListFilesInput(
            project_id=uuid4(),
            file_type="content_extraction",
        )
        result = await _list_files_activity(input_data)

        assert len(result) == 1
        assert isinstance(result[0], DmsFileInfo)

    @patch("src.activities.dms_activities.delete_file", new_callable=AsyncMock)
    async def test_delete_file_activity(self, mock_delete: Any) -> None:
        """Test that _delete_file_activity delegates to delete_file."""
        file_id = uuid4()
        mock_delete.return_value = None

        result = await _delete_file_activity(file_id)

        assert result is None
        mock_delete.assert_awaited_once_with(file_id)
