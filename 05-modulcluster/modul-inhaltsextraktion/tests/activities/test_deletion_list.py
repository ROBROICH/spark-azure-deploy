"""Tests for deletion activity file-listing functions (_list_all_files, _list_project_files_for_deletion)."""

from typing import Any
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.activities.deletion import (
    _list_all_files,
    _list_project_files_for_deletion,
)
from src.workflows.deletion.types import DeletionFileInfo


def _make_dms_file(
    *,
    file_id: str | None = None,
    filename: str,
    file_type: str,
) -> MagicMock:
    """Create a mock DMS file object with the given attributes."""
    file_obj = MagicMock()
    file_obj.id = UUID(file_id) if file_id else uuid4()
    file_obj.filename = filename
    file_obj.type = file_type
    return file_obj


class TestListAllFiles:
    @pytest.mark.asyncio
    @patch("src.activities.deletion.list_all_files")
    async def test_returns_empty_when_no_files(self, mock_list_all_files: Any) -> None:
        project_id = uuid4()
        mock_list_all_files.return_value = []

        result = await _list_all_files(project_id, "document")

        assert result == []
        mock_list_all_files.assert_awaited_once_with(project_id, "document")

    @pytest.mark.asyncio
    @patch("src.activities.deletion.list_all_files")
    async def test_maps_results_to_deletion_file_info(self, mock_list_all_files: Any) -> None:
        project_id = uuid4()
        mock_list_all_files.return_value = [
            _make_dms_file(filename="doc1.pdf", file_type="document"),
            _make_dms_file(filename="doc2.pdf", file_type="document"),
        ]

        result = await _list_all_files(project_id, "document")

        assert len(result) == 2
        assert result[0].filename == "doc1.pdf"
        assert result[1].filename == "doc2.pdf"
        assert result[0].file_type == "document"


class TestListProjectFilesForDeletion:
    """Tests for the _list_project_files_for_deletion activity."""

    @pytest.mark.asyncio
    @patch("src.activities.deletion._list_all_files")
    async def test_lists_documents_and_content_extractions(self, mock_list_all_files: Any) -> None:
        """Test that documents and content extractions are listed in separate categories."""
        project_id = uuid4()
        mock_list_all_files.side_effect = [
            [DeletionFileInfo(file_id=str(uuid4()), filename="doc.pdf", file_type="document")],
            [DeletionFileInfo(file_id=str(uuid4()), filename="doc/page_1.json", file_type="content_extraction")],
        ]

        result = await _list_project_files_for_deletion(project_id)

        assert len(result["documents"]) == 1
        assert len(result["content_extractions"]) == 1
        assert result["documents"][0].filename == "doc.pdf"
        assert result["content_extractions"][0].filename == "doc/page_1.json"
