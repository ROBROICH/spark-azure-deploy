"""Tests for DMS deletion activities (delete document, cleanup extractions, update summary)."""

import json
from datetime import UTC, datetime
from pathlib import PurePosixPath
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest

from src.activities.deletion import (
    _cleanup_content_extractions_dms,
    _delete_single_document_from_dms,
    _update_summary_for_deleted_documents,
)
from src.utils.dms_utils import FileObject
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


def _make_summary_file_object(
    *,
    filename: str = "summary.json",
    created_at: datetime | None = None,
) -> FileObject:
    timestamp = created_at or datetime(2026, 1, 1, tzinfo=UTC)
    return FileObject(
        id=uuid4(),
        type="content_extraction",
        filename=filename,
        mime_type="application/json",
        bucket_path=PurePosixPath(filename),
        created_at=timestamp,
        updated_at=timestamp,
    )


@pytest.fixture
def summary_file() -> FileObject:
    return _make_summary_file_object()


def _summary_bytes(*document_paths: str) -> bytes:
    return json.dumps(
        {
            "totalDurationSeconds": 1.0,
            "processedFiles": [
                {
                    "documentPath": path,
                    "documentName": path,
                    "processedJsonFileId": f"result-{path}",
                }
                for path in document_paths
            ],
        }
    ).encode("utf-8")


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
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_returns_failed_when_summary_missing(self, mock_list_files: AsyncMock, project_id: UUID) -> None:
        """Test that missing summary.json causes all filenames to be reported as failed."""
        mock_list_files.return_value = []

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
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_returns_failed_when_summary_file_not_found(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        """Test that a download failure causes all filenames to be reported as failed."""
        mock_list_files.return_value = [summary_file]
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
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_updates_summary_and_reuploads_file(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        """Test that matching entries are removed from summary.json and the file is re-uploaded."""
        mock_list_files.return_value = [summary_file]
        summary_data = {
            "totalDurationSeconds": 1.0,
            "processedFiles": [
                {
                    "documentPath": "doc1.pdf",
                    "documentName": "doc1.pdf",
                    "processedJsonFileId": "result-1",
                },
                {
                    "documentPath": "doc2.pdf",
                    "documentName": "doc2.pdf",
                    "processedJsonFileId": "result-2",
                },
            ],
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
        mock_delete_file.assert_awaited_once_with(summary_file.id)
        mock_upload_file.assert_awaited_once()

        uploaded_input = mock_upload_file.await_args.args[0]
        uploaded_summary = json.loads(uploaded_input.data.decode("utf-8"))
        assert uploaded_input.filename == "summary.json"
        assert uploaded_input.project_id == project_id
        assert uploaded_input.file_type == "content_extraction"
        assert uploaded_summary["processedFiles"] == [
            {
                "documentName": "doc2.pdf",
                "documentPath": "doc2.pdf",
                "processedJsonFileId": "result-2",
                "sourceFileId": None,
            }
        ]

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_returns_failed_when_no_requested_entries_in_summary(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        summary_file: FileObject,
    ) -> None:
        """Test that filenames not present in the summary are reported as failed."""
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = json.dumps(
            {
                "totalDurationSeconds": 1.0,
                "processedFiles": [
                    {
                        "documentPath": "other.pdf",
                        "documentName": "other.pdf",
                        "processedJsonFileId": "result-other",
                    },
                ],
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
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_uploads_new_summary_before_deleting_old(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = _summary_bytes("doc1.pdf", "doc2.pdf")
        mock_upload_file.return_value = MagicMock(id=uuid4())
        call_order = MagicMock()
        call_order.attach_mock(mock_upload_file, "upload_file")
        call_order.attach_mock(mock_delete_file, "delete_file")

        await _update_summary_for_deleted_documents(
            UpdateSummaryInput(project_id=project_id, deleted_document_filenames=["doc1.pdf"])
        )

        assert [name for name, _args, _kwargs in call_order.mock_calls] == ["upload_file", "delete_file"]

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_upload_failure_propagates_and_keeps_old_summary(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = _summary_bytes("doc1.pdf", "doc2.pdf")
        mock_upload_file.side_effect = RuntimeError("DMS upload failed")

        with pytest.raises(RuntimeError, match="DMS upload failed"):
            await _update_summary_for_deleted_documents(
                UpdateSummaryInput(project_id=project_id, deleted_document_filenames=["doc1.pdf", "doc2.pdf"])
            )

        mock_delete_file.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.activity")
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_old_summary_delete_failure_after_upload_is_logged_with_traceback(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        mock_activity: MagicMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = _summary_bytes("doc1.pdf", "doc2.pdf")
        mock_delete_file.side_effect = httpx.ConnectError("DMS unreachable")

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(project_id=project_id, deleted_document_filenames=["doc1.pdf"])
        )

        assert result.success == ["doc1.pdf"]
        assert result.failed == []
        mock_upload_file.assert_awaited_once()
        mock_activity.logger.exception.assert_called_once()

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_unexpected_old_summary_delete_error_propagates(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
        summary_file: FileObject,
    ) -> None:
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = _summary_bytes("doc1.pdf")
        mock_delete_file.side_effect = ValueError("bug")

        with pytest.raises(ValueError, match="bug"):
            await _update_summary_for_deleted_documents(
                UpdateSummaryInput(project_id=project_id, deleted_document_filenames=["doc1.pdf"])
            )

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_multiple_summaries_read_newest_and_delete_all_old(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        project_id: UUID,
    ) -> None:
        older = _make_summary_file_object(created_at=datetime(2026, 1, 1, tzinfo=UTC))
        newest = _make_summary_file_object(created_at=datetime(2026, 2, 1, tzinfo=UTC))
        other = _make_summary_file_object(filename="doc1/page_1.json")
        mock_list_files.return_value = [older, other, newest]
        mock_download_file.return_value = _summary_bytes("doc1.pdf", "doc2.pdf")

        result = await _update_summary_for_deleted_documents(
            UpdateSummaryInput(project_id=project_id, deleted_document_filenames=["doc1.pdf"])
        )

        assert result.success == ["doc1.pdf"]
        mock_download_file.assert_awaited_once_with(newest.id)
        mock_upload_file.assert_awaited_once()
        assert [c.args[0] for c in mock_delete_file.await_args_list] == [newest.id, older.id]

    @pytest.mark.asyncio
    @patch("src.utils.summary_file.upload_file", new_callable=AsyncMock)
    @patch("src.utils.summary_file.delete_file", new_callable=AsyncMock)
    @patch("src.activities.deletion.download_file", new_callable=AsyncMock)
    @patch("src.utils.dms_utils.list_files", new_callable=AsyncMock)
    async def test_partially_removed_entries_report_success_and_failure(
        self,
        mock_list_files: AsyncMock,
        mock_download_file: AsyncMock,
        mock_delete_file: AsyncMock,
        mock_upload_file: AsyncMock,
        summary_file: FileObject,
    ) -> None:
        """Test that entries found in the summary are successful and missing ones are failed."""
        mock_list_files.return_value = [summary_file]
        mock_download_file.return_value = json.dumps(
            {
                "totalDurationSeconds": 1.0,
                "processedFiles": [
                    {
                        "documentPath": "doc1.pdf",
                        "documentName": "doc1.pdf",
                        "processedJsonFileId": "result-1",
                    },
                    {
                        "documentPath": "other.pdf",
                        "documentName": "other.pdf",
                        "processedJsonFileId": "result-other",
                    },
                ],
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
