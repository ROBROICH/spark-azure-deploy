"""Tests for EnsureQdrantWorkflow."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from temporal.workflows.inhaltsextraktion.types import (
    EnsureQdrantInput,
    Metadata,
    ProcessedDocument,
    ProcessedFileInfo,
)

from src.workflows.qdrant.ensure_workflow import EnsureQdrantWorkflow
from src.workflows.qdrant.workflow import QdrantBuilderWorkflowOutput

_MOD = "src.workflows.qdrant.ensure_workflow"


@pytest.fixture(autouse=True)
def _mock_snapshot_config():
    """snapshot_config() is called at the top of every workflow run."""
    with patch(f"{_MOD}.snapshot_config"):
        yield


def _make_processed_file(name: str = "doc.pdf") -> ProcessedFileInfo:
    return ProcessedFileInfo(
        document_name=name,
        document_path=f"path/to/{name}",
        processed_json_file_id=str(uuid4()),
        processed_document=ProcessedDocument(
            metadata=Metadata(
                original_document_name=name,
                summary="test",
            ),
            markdown_content="# test",
        ),
    )


def _mock_workflow(
    *,
    fetch_result: list[ProcessedFileInfo] | None = None,
) -> MagicMock:
    mock_wf = MagicMock()
    mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
    mock_wf.logger = MagicMock()
    mock_wf.execute_child_workflow = AsyncMock()
    # execute_activity is used for the cross-queue fetch call
    mock_wf.execute_activity = AsyncMock(return_value=fetch_result or [])
    return mock_wf


@pytest.mark.asyncio
class TestEnsureQdrantWorkflow:
    async def test_already_indexed_without_inline_data_returns_early(self) -> None:
        """If Qdrant has points for the project, return immediately."""
        mock_wf = _mock_workflow()
        mock_count = AsyncMock(return_value=42)

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(EnsureQdrantInput(project_id="proj-1"))

        assert result.already_indexed is True
        assert result.indexed_now is False
        mock_wf.execute_child_workflow.assert_not_awaited()
        mock_wf.execute_activity.assert_not_awaited()

    async def test_inline_data_indexes_even_when_project_already_has_points(self) -> None:
        """Inline processed files are authoritative for incremental re-indexing."""
        mock_wf = _mock_workflow()
        mock_count = AsyncMock(return_value=42)
        qdrant_output = QdrantBuilderWorkflowOutput(
            processed_document_ids=["doc-1"],
            failed_document_ids=[],
        )
        mock_wf.execute_child_workflow.return_value = qdrant_output

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(
                EnsureQdrantInput(
                    project_id="proj-1",
                    processed_files=[_make_processed_file()],
                )
            )

        mock_count.assert_not_awaited()
        assert result.already_indexed is False
        assert result.indexed_now is True
        assert result.processed_ids == ["doc-1"]
        mock_wf.execute_child_workflow.assert_awaited_once()
        mock_wf.execute_activity.assert_not_awaited()

    async def test_not_indexed_no_inline_data_fetches_from_exam_service(self) -> None:
        """If empty and no inline data, fetch from examination service via cross-queue activity."""
        fetched_file = _make_processed_file("fetched.pdf")
        mock_wf = _mock_workflow(fetch_result=[fetched_file])
        mock_count = AsyncMock(return_value=0)

        qdrant_output = QdrantBuilderWorkflowOutput(
            processed_document_ids=["doc-1"],
            failed_document_ids=[],
        )
        mock_wf.execute_child_workflow.return_value = qdrant_output

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(
                EnsureQdrantInput(project_id="proj-1")
            )

        assert result.indexed_now is True
        assert result.processed_ids == ["doc-1"]
        # Verify cross-queue activity was called
        mock_wf.execute_activity.assert_awaited_once()
        call_args = mock_wf.execute_activity.call_args
        assert call_args.args[0] == "fetch_processed_documents_from_graph"
        assert call_args.args[1] == "proj-1"
        assert call_args.kwargs["task_queue"] == "orchestration"

    async def test_not_indexed_no_data_anywhere_returns_false(self) -> None:
        """If Qdrant empty and examination service also has no data, return not-indexed."""
        mock_wf = _mock_workflow(fetch_result=[])
        mock_count = AsyncMock(return_value=0)

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(
                EnsureQdrantInput(project_id="proj-1")
            )

        assert result.already_indexed is False
        assert result.indexed_now is False
        mock_wf.execute_activity.assert_awaited_once()
        mock_wf.execute_child_workflow.assert_not_awaited()

    async def test_not_indexed_with_inline_data_triggers_builder(self) -> None:
        """If empty and inline data provided, trigger QdrantBuilderWorkflow directly."""
        mock_wf = _mock_workflow()
        mock_count = AsyncMock(return_value=0)

        qdrant_output = QdrantBuilderWorkflowOutput(
            processed_document_ids=["doc-1"],
            failed_document_ids=[],
        )
        mock_wf.execute_child_workflow.return_value = qdrant_output

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(
                EnsureQdrantInput(
                    project_id="proj-1",
                    processed_files=[_make_processed_file()],
                )
            )

        assert result.indexed_now is True
        assert result.processed_ids == ["doc-1"]
        # Should NOT call examination service when inline data is provided
        mock_wf.execute_activity.assert_not_awaited()
        mock_wf.execute_child_workflow.assert_awaited_once()

    async def test_processed_files_without_documents_skips(self) -> None:
        """If processed_files are provided but none have ProcessedDocument, skip."""
        mock_wf = _mock_workflow()
        mock_count = AsyncMock(return_value=0)

        empty_file = ProcessedFileInfo(
            document_name="empty.pdf",
            document_path="path/to/empty.pdf",
            processed_json_file_id=str(uuid4()),
            processed_document=None,
        )

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
        ):
            wf = EnsureQdrantWorkflow()
            result = await wf.run(
                EnsureQdrantInput(
                    project_id="proj-1",
                    processed_files=[empty_file],
                )
            )

        assert result.already_indexed is False
        assert result.indexed_now is False
        mock_wf.execute_child_workflow.assert_not_awaited()

    async def test_builder_failure_propagates(self) -> None:
        """If QdrantBuilderWorkflow raises, the error propagates to the caller."""
        mock_wf = _mock_workflow()
        mock_count = AsyncMock(return_value=0)

        mock_wf.execute_child_workflow.side_effect = RuntimeError("Qdrant connection lost")

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.count_qdrant_project_points", mock_count),
            pytest.raises(RuntimeError, match="Qdrant connection lost"),
        ):
            wf = EnsureQdrantWorkflow()
            await wf.run(
                EnsureQdrantInput(
                    project_id="proj-1",
                    processed_files=[_make_processed_file()],
                )
            )
