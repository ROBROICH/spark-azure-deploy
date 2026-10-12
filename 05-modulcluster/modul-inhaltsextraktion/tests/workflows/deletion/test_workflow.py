"""Tests for DeleteDocumentsWorkflow."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from temporal.contracts import (
    DeleteDocumentsWorkflowInput,
    DeleteDocumentsWorkflowOutput,
)

from src.workflows.deletion.types import (
    DeletionFileInfo,
    DMSDeleteSingleDocumentResult,
    UpdateSummaryResult,
)
from src.workflows.deletion.workflow import DeleteDocumentsWorkflow


def _make_document(filename: str = "doc1.pdf") -> DeletionFileInfo:
    """Create a minimal DeletionFileInfo with file_type 'document' for testing."""
    return DeletionFileInfo(
        file_id=str(uuid4()),
        filename=filename,
        file_type="document",
    )


def _make_content_extraction(filename: str = "doc1/page_1.json") -> DeletionFileInfo:
    """Create a minimal DeletionFileInfo with file_type 'content_extraction' for testing."""
    return DeletionFileInfo(
        file_id=str(uuid4()),
        filename=filename,
        file_type="content_extraction",
    )


@pytest.mark.asyncio
class TestDeleteDocumentsWorkflow:
    """Tests for DeleteDocumentsWorkflow."""

    async def test_run_returns_empty_output_when_no_file_ids(self) -> None:
        """Test that an empty file_ids list returns an empty output with no deletions."""
        project_id = uuid4()
        workflow_input = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=[],
        )

        result = await DeleteDocumentsWorkflow().run(workflow_input)

        assert isinstance(result, DeleteDocumentsWorkflowOutput)
        assert result.project_id == project_id
        assert result.documents_deleted == []
        assert result.documents_failed == []
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == []
        assert result.qdrant_failed == []

    @patch("src.workflows.deletion.workflow.update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_document_from_dms", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_file_qdrant", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.list_project_files_for_deletion", new_callable=AsyncMock)
    async def test_run_deletes_selected_files_and_updates_summary_once(
        self,
        mock_list_project_files_for_deletion: AsyncMock,
        mock_delete_single_file_qdrant: AsyncMock,
        mock_delete_single_document_from_dms: AsyncMock,
        mock_update_summary_for_deleted_documents: AsyncMock,
    ) -> None:
        """Test that selected files are deleted from Qdrant and DMS, and the summary is updated once."""
        project_id = uuid4()
        doc1 = _make_document("doc1.pdf")
        doc2 = _make_document("doc2.pdf")
        content_extractions = [
            _make_content_extraction("doc1/page_1.json"),
            _make_content_extraction("doc2/page_1.json"),
        ]

        workflow_input = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=[doc1.file_id, doc2.file_id],
        )

        mock_list_project_files_for_deletion.return_value = {
            "documents": [doc1, doc2],
            "content_extractions": content_extractions,
        }
        mock_delete_single_file_qdrant.side_effect = [True, True]
        mock_delete_single_document_from_dms.side_effect = [
            DMSDeleteSingleDocumentResult(
                document_filename="doc1.pdf",
                documents_deleted=["doc1.pdf"],
                documents_failed=[],
                content_extractions_deleted=["doc1/page_1.json"],
                content_extractions_failed=[],
            ),
            DMSDeleteSingleDocumentResult(
                document_filename="doc2.pdf",
                documents_deleted=["doc2.pdf"],
                documents_failed=[],
                content_extractions_deleted=["doc2/page_1.json"],
                content_extractions_failed=[],
            ),
        ]
        mock_update_summary_for_deleted_documents.return_value = UpdateSummaryResult(
            success=["doc1.pdf", "doc2.pdf"],
            failed=[],
        )

        result = await DeleteDocumentsWorkflow().run(workflow_input)

        assert result.project_id == project_id
        assert result.documents_deleted == ["doc1.pdf", "doc2.pdf"]
        assert result.documents_failed == []
        assert result.content_extractions_deleted == [
            "doc1/page_1.json",
            "doc2/page_1.json",
        ]
        assert result.content_extractions_failed == []
        assert result.summary_update_success == ["doc1.pdf", "doc2.pdf"]
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == ["doc1.pdf", "doc2.pdf"]
        assert result.qdrant_failed == []

        mock_list_project_files_for_deletion.assert_awaited_once_with(project_id)
        assert mock_delete_single_file_qdrant.await_count == 2
        assert mock_delete_single_document_from_dms.await_count == 2
        mock_update_summary_for_deleted_documents.assert_awaited_once()

        update_input = mock_update_summary_for_deleted_documents.await_args.args[0]
        assert update_input.project_id == project_id
        assert update_input.deleted_document_filenames == ["doc1.pdf", "doc2.pdf"]

    @patch("src.workflows.deletion.workflow.update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_document_from_dms", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_file_qdrant", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.list_project_files_for_deletion", new_callable=AsyncMock)
    async def test_run_skips_dms_and_summary_when_qdrant_deletion_fails(
        self,
        mock_list_project_files_for_deletion: AsyncMock,
        mock_delete_single_file_qdrant: AsyncMock,
        mock_delete_single_document_from_dms: AsyncMock,
        mock_update_summary_for_deleted_documents: AsyncMock,
    ) -> None:
        """Test that DMS deletion and summary update are skipped when Qdrant deletion fails."""
        project_id = uuid4()
        doc1 = _make_document("doc1.pdf")

        workflow_input = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=[doc1.file_id],
        )

        mock_list_project_files_for_deletion.return_value = {
            "documents": [doc1],
            "content_extractions": [],
        }
        mock_delete_single_file_qdrant.return_value = False

        result = await DeleteDocumentsWorkflow().run(workflow_input)

        assert result.project_id == project_id
        assert result.documents_deleted == []
        assert result.documents_failed == []
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == []
        assert result.qdrant_failed == ["doc1.pdf"]

        mock_delete_single_document_from_dms.assert_not_awaited()
        mock_update_summary_for_deleted_documents.assert_not_awaited()

    @patch("src.workflows.deletion.workflow.update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_document_from_dms", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_file_qdrant", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.list_project_files_for_deletion", new_callable=AsyncMock)
    async def test_run_marks_document_failed_when_dms_delete_raises(
        self,
        mock_list_project_files_for_deletion: AsyncMock,
        mock_delete_single_file_qdrant: AsyncMock,
        mock_delete_single_document_from_dms: AsyncMock,
        mock_update_summary_for_deleted_documents: AsyncMock,
    ) -> None:
        """Test that a document is marked as failed when the DMS delete activity raises an exception."""
        project_id = uuid4()
        doc1 = _make_document("doc1.pdf")

        workflow_input = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=[doc1.file_id],
        )

        mock_list_project_files_for_deletion.return_value = {
            "documents": [doc1],
            "content_extractions": [],
        }
        mock_delete_single_file_qdrant.return_value = True
        mock_delete_single_document_from_dms.side_effect = RuntimeError("dms failed")

        result = await DeleteDocumentsWorkflow().run(workflow_input)

        assert result.project_id == project_id
        assert result.documents_deleted == []
        assert result.documents_failed == ["doc1.pdf"]
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == ["doc1.pdf"]
        assert result.qdrant_failed == []

        mock_update_summary_for_deleted_documents.assert_not_awaited()

    @patch("src.workflows.deletion.workflow.update_summary_for_deleted_documents", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_document_from_dms", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.delete_single_file_qdrant", new_callable=AsyncMock)
    @patch("src.workflows.deletion.workflow.list_project_files_for_deletion", new_callable=AsyncMock)
    async def test_run_ignores_unknown_file_ids(
        self,
        mock_list_project_files_for_deletion: AsyncMock,
        mock_delete_single_file_qdrant: AsyncMock,
        mock_delete_single_document_from_dms: AsyncMock,
        mock_update_summary_for_deleted_documents: AsyncMock,
    ) -> None:
        """Test that file IDs not present in the project are silently ignored."""
        project_id = uuid4()
        known_doc = _make_document("doc1.pdf")
        unknown_file_id = uuid4()

        workflow_input = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=[unknown_file_id],
        )

        mock_list_project_files_for_deletion.return_value = {
            "documents": [known_doc],
            "content_extractions": [],
        }

        result = await DeleteDocumentsWorkflow().run(workflow_input)

        assert result.project_id == project_id
        assert result.documents_deleted == []
        assert result.documents_failed == []
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == []
        assert result.qdrant_failed == []

        mock_delete_single_file_qdrant.assert_not_awaited()
        mock_delete_single_document_from_dms.assert_not_awaited()
        mock_update_summary_for_deleted_documents.assert_not_awaited()
