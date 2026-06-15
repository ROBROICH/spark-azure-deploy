"""Tests for DMS deletion activities (delete document, cleanup extractions, update summary)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.activities.deletion import (
    _cleanup_content_extractions_dms,
    _delete_single_document_from_dms,
    _update_summary_for_deleted_documents,
)
from src.workflows.deletion.types import (
    CleanupContentExtractionsInput,
    DeletionFileInfo,
    DMSDeleteSingleDocumentInput,
    UpdateSummaryInput,
    UpdateSummaryResult,
)


@pytest.fixture
def project_id() -> UUID:
    """Return a random project UUID for test isolation."""
    return uuid4()


@pytest.fixture
def document_file() -> DeletionFileInfo:
    """Return a DeletionFileInfo representing a sample document."""
    return DeletionFileInfo(
        file_id=str(uuid4()),
        filename="report.pdf",
        file_type="document",
    )


@pytest.fixture
def summary_file() -> DeletionFileInfo:
    """Return a DeletionFileInfo representing a summary.json content extraction."""
    return DeletionFileInfo(
        file_id=str(uuid4()),
        filename="summary.json",
        file_type="content_extraction",
    )


class TestDeleteSingleDocumentFromDms:
    """Tests for _delete_single_document_from_dms activity."""

    @pytest.mark.asyncio
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    async def test_deletes_document_and_matching_extractions(
        self, mock_delete_file: AsyncMock, project_id: UUID, document_file: DeletionFileInfo
    ) -> None:
        """Test that the document and its matching content extractions are deleted."""
        extractions = [
            DeletionFileInfo(
                file_id=str(uuid4()),
                filename="report/page_1.json",
                file_type="content_extraction",
            ),
            DeletionFileInfo(
                file_id=str(uuid4()),
                filename="report/images/img1.png",
                file_type="content_extraction",
            ),
            DeletionFileInfo(
                file_id=str(uuid4()),
                filename="other/page_1.json",
                file_type="content_extraction",
            ),
        ]

        result = await _delete_single_document_from_dms(
            DMSDeleteSingleDocumentInput(
                project_id=project_id,
                document_file=document_file,
                existing_content_extractions=extractions,
            )
        )

        assert result.document_filename == "report.pdf"
        assert result.documents_deleted == ["report.pdf"]
        assert result.documents_failed == []
        assert result.content_extractions_deleted == [
            "report/page_1.json",
            "report/images/img1.png",
        ]
        assert result.content_extractions_failed == []
        assert mock_delete_file.await_count == 3

    @pytest.mark.asyncio
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    async def test_marks_failed_extraction_deletions_but_continues(
        self, mock_delete_file: AsyncMock, project_id: UUID, document_file: DeletionFileInfo
    ) -> None:
        """Test that a failed extraction deletion is recorded but does not block others."""
        failing_extraction = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="report/page_1.json",
            file_type="content_extraction",
        )
        ok_extraction = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="report/images/img1.png",
            file_type="content_extraction",
        )

        async def delete_side_effect(file_id: UUID) -> None:
            """Simulate a deletion failure for the failing extraction."""
            if file_id == UUID(failing_extraction.file_id):
                raise RuntimeError("delete failed")

        mock_delete_file.side_effect = delete_side_effect

        result = await _delete_single_document_from_dms(
            DMSDeleteSingleDocumentInput(
                project_id=project_id,
                document_file=document_file,
                existing_content_extractions=[failing_extraction, ok_extraction],
            )
        )

        assert result.documents_deleted == ["report.pdf"]
        assert result.documents_failed == []
        assert result.content_extractions_deleted == ["report/images/img1.png"]
        assert result.content_extractions_failed == ["report/page_1.json"]

    @pytest.mark.asyncio
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    async def test_marks_document_delete_failure(
        self, mock_delete_file: AsyncMock, project_id: UUID, document_file: DeletionFileInfo
    ) -> None:
        """Test that a failed document deletion is recorded in documents_failed."""

        async def delete_side_effect(file_id: UUID) -> None:
            """Simulate a deletion failure for the document itself."""
            if file_id == UUID(document_file.file_id):
                raise RuntimeError("document delete failed")

        mock_delete_file.side_effect = delete_side_effect

        result = await _delete_single_document_from_dms(
            DMSDeleteSingleDocumentInput(
                project_id=project_id,
                document_file=document_file,
                existing_content_extractions=[],
            )
        )

        assert result.documents_deleted == []
        assert result.documents_failed == ["report.pdf"]
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []

    @pytest.mark.asyncio
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    async def test_non_matching_extractions_are_ignored(
        self, mock_delete_file: AsyncMock, project_id: UUID, document_file: DeletionFileInfo
    ) -> None:
        """Test that extractions not matching the document prefix are not deleted."""
        extractions = [
            DeletionFileInfo(
                file_id=str(uuid4()),
                filename="another_report/page_1.json",
                file_type="content_extraction",
            )
        ]

        result = await _delete_single_document_from_dms(
            DMSDeleteSingleDocumentInput(
                project_id=project_id,
                document_file=document_file,
                existing_content_extractions=extractions,
            )
        )

        assert result.documents_deleted == ["report.pdf"]
        assert result.content_extractions_deleted == []
        assert mock_delete_file.await_count == 1


class TestCleanupContentExtractionsDms:
    """Tests for _cleanup_content_extractions_dms activity."""

    @pytest.mark.asyncio
    @patch("src.activities.deletion._update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_deletes_matching_extractions_and_updates_summary(
        self,
        mock_list_all_files: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_update_summary: AsyncMock,
        project_id: UUID,
    ) -> None:
        """Test that matching content extractions are deleted and the summary is updated."""
        mock_list_all_files.return_value = [
            DeletionFileInfo(file_id=str(uuid4()), filename="report/page_1.json", file_type="content_extraction"),
            DeletionFileInfo(file_id=str(uuid4()), filename="report/images/img1.png", file_type="content_extraction"),
            DeletionFileInfo(file_id=str(uuid4()), filename="other/page_1.json", file_type="content_extraction"),
        ]
        mock_update_summary.return_value = UpdateSummaryResult(
            success=["report.pdf"],
            failed=[],
        )

        result = await _cleanup_content_extractions_dms(
            CleanupContentExtractionsInput(
                project_id=project_id,
                filename="report.pdf",
            )
        )

        assert result.content_extractions_deleted == [
            "report/page_1.json",
            "report/images/img1.png",
        ]
        assert result.content_extractions_failed == []
        assert result.summary_update_success == ["report.pdf"]
        assert result.summary_update_failed == []
        assert mock_delete_file.await_count == 2
        mock_update_summary.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("src.activities.deletion._update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_collects_failed_extraction_deletions(
        self,
        mock_list_all_files: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_update_summary: AsyncMock,
    ) -> None:
        """Test that failed extraction deletions are recorded alongside successes."""
        failing = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="report/page_1.json",
            file_type="content_extraction",
        )
        ok = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="report/images/img1.png",
            file_type="content_extraction",
        )
        mock_list_all_files.return_value = [failing, ok]
        mock_update_summary.return_value = UpdateSummaryResult(
            success=[],
            failed=["report.pdf"],
        )

        async def delete_side_effect(file_id: UUID) -> None:
            """Simulate a deletion failure for the failing extraction."""
            if file_id == UUID(failing.file_id):
                raise RuntimeError("failed")

        mock_delete_file.side_effect = delete_side_effect

        result = await _cleanup_content_extractions_dms(
            CleanupContentExtractionsInput(
                project_id=uuid4(),
                filename="report.pdf",
            )
        )

        assert result.content_extractions_deleted == ["report/images/img1.png"]
        assert result.content_extractions_failed == ["report/page_1.json"]
        assert result.summary_update_success == []
        assert result.summary_update_failed == ["report.pdf"]


class TestUpdateSummaryForDeletedDocuments:
    """Tests for _update_summary_for_deleted_documents activity."""

    @pytest.mark.asyncio
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_returns_failed_when_summary_missing(
        self, mock_list_all_files: AsyncMock, project_id: UUID
    ) -> None:
        """Test that missing summary.json causes all filenames to be reported as failed."""
        mock_list_all_files.return_value = []

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=project_id,
                deleted_document_filenames=["doc.pdf"],
            )
        )

        assert result.success == []
        assert result.failed == ["doc.pdf"]

    @pytest.mark.asyncio
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_returns_failed_when_summary_file_not_found(
        self,
        mock_list_all_files: AsyncMock,
        mock_download_file: AsyncMock,
        project_id: UUID,
        summary_file: DeletionFileInfo,
    ) -> None:
        """Test that a download failure causes all filenames to be reported as failed."""
        mock_list_all_files.return_value = [summary_file]
        mock_download_file.side_effect = FileNotFoundError("missing")

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=project_id,
                deleted_document_filenames=["doc.pdf"],
            )
        )

        assert result.success == []
        assert result.failed == ["doc.pdf"]

    @pytest.mark.asyncio
    @patch("src.activities.deletion.upload_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_updates_summary_and_reuploads_file(
        self,
        mock_list_all_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: DeletionFileInfo,
    ) -> None:
        """Test that matching entries are removed from summary.json and the file is re-uploaded."""
        mock_list_all_files.return_value = [summary_file]
        summary_data = {
            "processed_files": [
                {"document_path": "doc1.pdf", "document_name": "doc1.pdf"},
                {"document_path": "doc2.pdf", "document_name": "doc2.pdf"},
            ]
        }
        mock_download_file.return_value = json.dumps(summary_data).encode("utf-8")
        mock_upload_file.return_value = MagicMock()

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=project_id,
                deleted_document_filenames=["doc1.pdf"],
            )
        )

        assert result.success == ["doc1.pdf"]
        assert result.failed == []
        mock_delete_file.assert_awaited_once_with(UUID(summary_file.file_id))
        mock_upload_file.assert_awaited_once()

        uploaded_input = mock_upload_file.await_args.args[0]
        uploaded_summary = json.loads(uploaded_input.data.decode("utf-8"))
        assert uploaded_input.filename == "summary.json"
        assert uploaded_input.project_id == project_id
        assert uploaded_input.file_type == "content_extraction"
        assert uploaded_summary["processed_files"] == [{"document_path": "doc2.pdf", "document_name": "doc2.pdf"}]

    @pytest.mark.asyncio
    @patch("src.activities.deletion.upload_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_returns_failed_when_no_requested_entries_in_summary(
        self,
        mock_list_all_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        summary_file: DeletionFileInfo,
    ) -> None:
        """Test that filenames not present in the summary are reported as failed."""
        mock_list_all_files.return_value = [summary_file]
        mock_download_file.return_value = json.dumps(
            {
                "processed_files": [
                    {"document_path": "other.pdf"},
                ]
            }
        ).encode("utf-8")

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=uuid4(),
                deleted_document_filenames=["doc.pdf"],
            )
        )

        assert result.success == []
        assert result.failed == ["doc.pdf"]
        mock_delete_file.assert_not_awaited()
        mock_upload_file.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("src.activities.deletion.upload_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_returns_all_requested_as_failed_when_replace_fails(
        self,
        mock_list_all_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: DeletionFileInfo,
    ) -> None:
        """Test that all requested filenames are failed when the summary replace operation fails."""
        mock_list_all_files.return_value = [summary_file]
        mock_download_file.return_value = json.dumps(
            {
                "processed_files": [
                    {"document_path": "doc1.pdf"},
                    {"document_path": "doc2.pdf"},
                ]
            }
        ).encode("utf-8")
        mock_delete_file.side_effect = RuntimeError("cannot replace")

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=project_id,
                deleted_document_filenames=["doc1.pdf", "doc2.pdf"],
            )
        )

        assert result.success == []
        assert result.failed == ["doc1.pdf", "doc2.pdf"]
        mock_upload_file.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("src.activities.deletion.upload_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.activities.deletion._list_all_files", new_callable=AsyncMock)
    async def test_partially_removed_entries_report_success_and_failure(
        self,
        mock_list_all_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        summary_file: DeletionFileInfo,
    ) -> None:
        """Test that entries found in the summary are successful and missing ones are failed."""
        mock_list_all_files.return_value = [summary_file]
        mock_download_file.return_value = json.dumps(
            {
                "processed_files": [
                    {"document_path": "doc1.pdf"},
                    {"document_path": "other.pdf"},
                ]
            }
        ).encode("utf-8")
        mock_upload_file.return_value = MagicMock()

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(
                project_id=uuid4(),
                deleted_document_filenames=["doc1.pdf", "missing.pdf"],
            )
        )

        assert result.success == ["doc1.pdf"]
        assert result.failed == ["missing.pdf"]
