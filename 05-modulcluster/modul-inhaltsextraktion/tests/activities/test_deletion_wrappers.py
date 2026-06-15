"""Tests for deletion activity workflow wrapper functions (Temporal execute_activity wrappers)."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.activities.deletion import (
    cleanup_content_extractions_dms,
    delete_single_document_from_dms,
    delete_single_file_qdrant,
    list_project_files_for_deletion,
    update_summary_for_deleted_documents,
)
from src.workflows.deletion.types import (
    CleanupContentExtractionsInput,
    DeletionFileInfo,
    DMSDeleteSingleDocumentInput,
    DMSDeleteSingleDocumentResult,
    QdrantDocumentDeleteInput,
    UpdateSummaryInput,
    UpdateSummaryResult,
)


@pytest.fixture
def mock_config() -> MagicMock:
    """Return a mock config with standard retry attempt settings."""
    return MagicMock(TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS=7)


@pytest.mark.asyncio
class TestWorkflowWrappers:
    """Tests for Temporal workflow wrapper functions that delegate to execute_activity."""

    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_list_project_files_for_deletion_wrapper(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that list_project_files_for_deletion delegates to execute_activity."""
        mock_get_config.return_value = mock_config
        project_id = uuid4()
        expected = {"documents": [], "content_extractions": []}
        mock_execute_activity.return_value = expected

        result = await list_project_files_for_deletion(project_id)

        assert result == expected
        mock_execute_activity.assert_awaited_once()

    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_delete_single_document_from_dms_wrapper(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that delete_single_document_from_dms delegates to execute_activity."""
        mock_get_config.return_value = mock_config
        input_data = DMSDeleteSingleDocumentInput(
            project_id=uuid4(),
            document_file=DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc.pdf",
                file_type="document",
            ),
        )
        expected = DMSDeleteSingleDocumentResult(
            document_filename="doc.pdf",
            documents_deleted=["doc.pdf"],
        )
        mock_execute_activity.return_value = expected

        result = await delete_single_document_from_dms(input_data)

        assert result == expected
        mock_execute_activity.assert_awaited_once()

    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_cleanup_content_extractions_wrapper(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that cleanup_content_extractions_dms delegates to execute_activity."""
        mock_get_config.return_value = mock_config
        input_data = CleanupContentExtractionsInput(
            project_id=uuid4(),
            filename="doc.pdf",
        )
        expected = UpdateSummaryResult(success=["doc.pdf"], failed=[])
        mock_execute_activity.return_value = expected

        result = await cleanup_content_extractions_dms(input_data)

        assert result == expected
        mock_execute_activity.assert_awaited_once()

    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_update_summary_wrapper(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that update_summary_for_deleted_documents delegates to execute_activity."""
        mock_get_config.return_value = mock_config
        input_data = UpdateSummaryInput(
            project_id=uuid4(),
            deleted_document_filenames=["doc.pdf"],
        )
        expected = UpdateSummaryResult(success=["doc.pdf"], failed=[])
        mock_execute_activity.return_value = expected

        result = await update_summary_for_deleted_documents(input_data)

        assert result == expected
        mock_execute_activity.assert_awaited_once()

    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_delete_single_file_qdrant_returns_true_on_success(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that delete_single_file_qdrant returns True when execute_activity succeeds."""
        mock_get_config.return_value = mock_config
        mock_execute_activity.return_value = True
        input_data = QdrantDocumentDeleteInput(
            project_id=uuid4(),
            document_file=DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc.pdf",
                file_type="document",
            ),
        )

        result = await delete_single_file_qdrant(input_data)

        assert result is True
        mock_execute_activity.assert_awaited_once()

    @patch("src.activities.deletion.activity")
    @patch("src.activities.deletion.get_config")
    @patch("src.activities.deletion.workflow.execute_activity", new_callable=AsyncMock)
    async def test_delete_single_file_qdrant_returns_false_on_exception(
        self,
        mock_execute_activity: AsyncMock,
        mock_get_config: Any,
        _mock_activity: Any,
        mock_config: MagicMock,
    ) -> None:
        """Test that delete_single_file_qdrant returns False when execute_activity raises."""
        mock_get_config.return_value = mock_config
        mock_execute_activity.side_effect = RuntimeError("qdrant failed")
        input_data = QdrantDocumentDeleteInput(
            project_id=uuid4(),
            document_file=DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc.pdf",
                file_type="document",
            ),
        )

        result = await delete_single_file_qdrant(input_data)

        assert result is False
