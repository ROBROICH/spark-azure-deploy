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
    """Tests for the _list_all_files pagination helper."""

    @pytest.mark.asyncio
    @patch("src.activities.deletion.list_files")
    async def test_returns_empty_when_first_page_empty(self, mock_list_files: Any) -> None:
        """Test that an empty first page returns an empty list."""
        project_id = uuid4()
        mock_list_files.return_value = []

        result = await _list_all_files(project_id, "document")

        assert result == []
        mock_list_files.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("src.activities.deletion.list_files")
    async def test_maps_single_page_results(self, mock_list_files: Any) -> None:
        """Test that a single page of results is correctly mapped to DeletionFileInfo objects."""
        project_id = uuid4()
        mock_list_files.return_value = [
            _make_dms_file(filename="doc1.pdf", file_type="document"),
            _make_dms_file(filename="doc2.pdf", file_type="document"),
        ]

        result = await _list_all_files(project_id, "document", page_size=500)

        assert len(result) == 2
        assert result[0].filename == "doc1.pdf"
        assert result[1].filename == "doc2.pdf"
        assert result[0].file_type == "document"

    @pytest.mark.asyncio
    @patch("src.activities.deletion.list_files")
    async def test_paginates_until_partial_page(self, mock_list_files: Any) -> None:
        """Test that pagination continues until a partial page is returned."""
        project_id = uuid4()
        full_page = [_make_dms_file(filename=f"doc{i}.pdf", file_type="document") for i in range(2)]
        partial_page = [_make_dms_file(filename="last.pdf", file_type="document")]
        mock_list_files.side_effect = [full_page, partial_page]

        result = await _list_all_files(project_id, "document", page_size=2)

        assert len(result) == 3
        assert [item.filename for item in result] == ["doc0.pdf", "doc1.pdf", "last.pdf"]
        assert mock_list_files.await_count == 2


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
