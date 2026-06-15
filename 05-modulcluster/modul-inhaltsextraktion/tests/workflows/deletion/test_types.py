"""Tests for deletion workflow and activity types."""

from uuid import UUID, uuid4

from temporal.workflows.inhaltsextraktion.types import (
    DeleteDocumentsWorkflowInput,
    DeleteDocumentsWorkflowOutput,
)

from src.workflows.deletion.types import (
    CleanupContentExtractionsInput,
    CleanupContentExtractionsResult,
    DeletionFileInfo,
    DMSDeleteSingleDocumentInput,
    DMSDeleteSingleDocumentResult,
    QdrantDocumentDeleteInput,
    UpdateSummaryInput,
    UpdateSummaryResult,
)


class TestDeletionFileInfo:
    """Tests for DeletionFileInfo construction and factory methods."""

    def test_construction(self) -> None:
        """Test that DeletionFileInfo can be constructed with explicit fields."""
        file_info = DeletionFileInfo(
            file_id="12345678-1234-5678-1234-567812345678",
            filename="doc.pdf",
            file_type="document",
        )

        assert file_info.file_id == "12345678-1234-5678-1234-567812345678"
        assert file_info.filename == "doc.pdf"
        assert file_info.file_type == "document"

    def test_from_dict_with_type(self) -> None:
        """Test that from_dict correctly maps 'id' and 'type' keys to model fields."""
        file_info = DeletionFileInfo.from_dict(
            {
                "id": UUID("12345678-1234-5678-1234-567812345678"),
                "filename": "doc.pdf",
                "type": "document",
            }
        )

        assert file_info.file_id == "12345678-1234-5678-1234-567812345678"
        assert file_info.filename == "doc.pdf"
        assert file_info.file_type == "document"

    def test_from_dict_without_type_defaults_to_empty_string(self) -> None:
        """Test that from_dict defaults file_type to an empty string when 'type' key is missing."""
        file_info = DeletionFileInfo.from_dict(
            {
                "id": UUID("12345678-1234-5678-1234-567812345678"),
                "filename": "doc.pdf",
            }
        )

        assert file_info.file_id == "12345678-1234-5678-1234-567812345678"
        assert file_info.filename == "doc.pdf"
        assert file_info.file_type == ""


class TestDmsDeleteSingleDocumentInput:
    """Tests for DMSDeleteSingleDocumentInput construction and defaults."""

    def test_construction_defaults(self) -> None:
        """Test that existing_content_extractions defaults to an empty list."""
        project_id = uuid4()
        document_file = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="doc.pdf",
            file_type="document",
        )

        result = DMSDeleteSingleDocumentInput(
            project_id=project_id,
            document_file=document_file,
        )

        assert result.project_id == project_id
        assert result.document_file == document_file
        assert result.existing_content_extractions == []

    def test_construction_with_extractions(self) -> None:
        """Test that explicit content extractions are preserved on construction."""
        project_id = uuid4()
        document_file = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="doc.pdf",
            file_type="document",
        )
        extractions = [
            DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc/page_1.json",
                file_type="content_extraction",
            )
        ]

        result = DMSDeleteSingleDocumentInput(
            project_id=project_id,
            document_file=document_file,
            existing_content_extractions=extractions,
        )

        assert result.existing_content_extractions == extractions


class TestDmsDeleteSingleDocumentResult:
    """Tests for DMSDeleteSingleDocumentResult construction and defaults."""

    def test_defaults(self) -> None:
        """Test that all list fields default to empty lists."""
        result = DMSDeleteSingleDocumentResult(document_filename="doc.pdf")

        assert result.document_filename == "doc.pdf"
        assert result.documents_deleted == []
        assert result.documents_failed == []
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []

    def test_full_construction(self) -> None:
        """Test that all fields are correctly assigned when fully specified."""
        result = DMSDeleteSingleDocumentResult(
            document_filename="doc.pdf",
            documents_deleted=["doc.pdf"],
            documents_failed=["other.pdf"],
            content_extractions_deleted=["doc/page_1.json"],
            content_extractions_failed=["doc/images/img1.png"],
        )

        assert result.documents_deleted == ["doc.pdf"]
        assert result.documents_failed == ["other.pdf"]
        assert result.content_extractions_deleted == ["doc/page_1.json"]
        assert result.content_extractions_failed == ["doc/images/img1.png"]


class TestUpdateSummaryModels:
    """Tests for UpdateSummaryInput and UpdateSummaryResult models."""

    def test_update_summary_input_defaults(self) -> None:
        """Test that deleted_document_filenames defaults to an empty list."""
        project_id = uuid4()

        result = UpdateSummaryInput(project_id=project_id)

        assert result.project_id == project_id
        assert result.deleted_document_filenames == []

    def test_update_summary_result_defaults(self) -> None:
        """Test that success and failed lists default to empty."""
        result = UpdateSummaryResult()

        assert result.success == []
        assert result.failed == []

    def test_update_summary_result_full_construction(self) -> None:
        """Test that success and failed lists are correctly assigned when specified."""
        result = UpdateSummaryResult(
            success=["doc1.pdf"],
            failed=["doc2.pdf"],
        )

        assert result.success == ["doc1.pdf"]
        assert result.failed == ["doc2.pdf"]


class TestQdrantAndCleanupModels:
    """Tests for QdrantDocumentDeleteInput and CleanupContentExtractions models."""

    def test_qdrant_document_delete_input(self) -> None:
        """Test that QdrantDocumentDeleteInput stores project_id and document_file."""
        project_id = uuid4()
        document_file = DeletionFileInfo(
            file_id=str(uuid4()),
            filename="doc.pdf",
            file_type="document",
        )

        result = QdrantDocumentDeleteInput(
            project_id=project_id,
            document_file=document_file,
        )

        assert result.project_id == project_id
        assert result.document_file == document_file

    def test_cleanup_content_extractions_input(self) -> None:
        """Test that CleanupContentExtractionsInput stores project_id and filename."""
        project_id = uuid4()

        result = CleanupContentExtractionsInput(
            project_id=project_id,
            filename="doc.pdf",
        )

        assert result.project_id == project_id
        assert result.filename == "doc.pdf"

    def test_cleanup_content_extractions_result_defaults(self) -> None:
        """Test that all CleanupContentExtractionsResult list fields default to empty."""
        result = CleanupContentExtractionsResult()

        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []

    def test_cleanup_content_extractions_result_full_construction(self) -> None:
        """Test that all CleanupContentExtractionsResult fields are correctly assigned."""
        result = CleanupContentExtractionsResult(
            content_extractions_deleted=["doc/page_1.json"],
            content_extractions_failed=["doc/images/img1.png"],
            summary_update_success=["doc.pdf"],
            summary_update_failed=["other.pdf"],
        )

        assert result.content_extractions_deleted == ["doc/page_1.json"]
        assert result.content_extractions_failed == ["doc/images/img1.png"]
        assert result.summary_update_success == ["doc.pdf"]
        assert result.summary_update_failed == ["other.pdf"]


class TestDeleteDocumentsWorkflowModels:
    """Tests for DeleteDocumentsWorkflowInput and DeleteDocumentsWorkflowOutput models."""

    def test_workflow_input(self) -> None:
        """Test that workflow input stores project_id and file_ids."""
        project_id = uuid4()
        file_ids = [uuid4(), uuid4()]

        result = DeleteDocumentsWorkflowInput(
            project_id=project_id,
            file_ids=file_ids,
        )

        assert result.project_id == project_id
        assert result.file_ids == file_ids

    def test_workflow_output_defaults(self) -> None:
        """Test that all workflow output list fields default to empty."""
        project_id = uuid4()

        result = DeleteDocumentsWorkflowOutput(project_id=project_id)

        assert result.project_id == project_id
        assert result.documents_deleted == []
        assert result.documents_failed == []
        assert result.content_extractions_deleted == []
        assert result.content_extractions_failed == []
        assert result.summary_update_success == []
        assert result.summary_update_failed == []
        assert result.qdrant_deleted == []
        assert result.qdrant_failed == []

    def test_workflow_output_full_construction(self) -> None:
        """Test that all workflow output fields are correctly assigned when fully specified."""
        project_id = uuid4()

        result = DeleteDocumentsWorkflowOutput(
            project_id=project_id,
            documents_deleted=["doc1.pdf"],
            documents_failed=["doc2.pdf"],
            content_extractions_deleted=["doc1/page_1.json"],
            content_extractions_failed=["doc2/page_1.json"],
            summary_update_success=["doc1.pdf"],
            summary_update_failed=["doc2.pdf"],
            qdrant_deleted=["doc1.pdf"],
            qdrant_failed=["doc2.pdf"],
        )

        assert result.documents_deleted == ["doc1.pdf"]
        assert result.documents_failed == ["doc2.pdf"]
        assert result.content_extractions_deleted == ["doc1/page_1.json"]
        assert result.content_extractions_failed == ["doc2/page_1.json"]
        assert result.summary_update_success == ["doc1.pdf"]
        assert result.summary_update_failed == ["doc2.pdf"]
        assert result.qdrant_deleted == ["doc1.pdf"]
        assert result.qdrant_failed == ["doc2.pdf"]
