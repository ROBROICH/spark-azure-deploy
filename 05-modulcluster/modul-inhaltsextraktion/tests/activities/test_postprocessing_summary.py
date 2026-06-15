# tests/activities/test_postprocessing_summary.py
"""
Tests for _create_summary_from_results activity in postprocessing.py.
"""

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from temporal.workflows.inhaltsextraktion.types import BaseMetadata

from src.activities.postprocessing.schemas import CreateSummaryFromResultsInput, SummaryResult
from src.activities.postprocessing.summary import _create_summary_from_results
from src.workflows.types import SingleDocumentWorkflowOutput


def _make_result(
    name: str = "doc.pdf", path: str = "test/doc.pdf", file_id: Any = None
) -> SingleDocumentWorkflowOutput:
    """Create a SingleDocumentWorkflowOutput with default test values.

    ``file_id`` is the DMS file_id of the *source* DOCUMENT and is what
    propagates into ProcessedFileInfo.source_file_id. Tests that care about
    reconcile must pair this with a matching ``_make_dms_file(..., file_id=)``
    in ``document_files`` so the active-docs map contains the same id.
    """
    return SingleDocumentWorkflowOutput(
        final_json_file_id=uuid4(),
        file_id=str(file_id) if file_id is not None else str(uuid4()),
        document_name=name,
        document_path=path,
    )


def _make_base_metadata() -> BaseMetadata:
    """Create a BaseMetadata fixture with sample project data."""
    return BaseMetadata(
        application_id="test-project-id",
        planned_project="Autobahn A100",
        project_applicant="Landesdirektion Sachsen",
    )


def _make_dms_file(filename: str, file_id: Any = None) -> Any:
    """Build a MagicMock that mimics a DMS file row."""
    obj = MagicMock()
    obj.id = file_id if file_id is not None else uuid4()
    obj.filename = filename
    return obj


def _make_existing_summary_bytes(processed_files: list[dict[str, Any]]) -> bytes:
    """Build raw bytes for a synthetic existing summary.json payload."""
    payload = {
        "base_metadata": None,
        "total_duration_seconds": 0.0,
        "processed_files": processed_files,
    }
    return json.dumps(payload).encode("utf-8")


def _make_list_files_side_effect(
    *,
    summary_files: list[Any] | None = None,
    document_files: list[Any] | None = None,
) -> Any:
    """Return a side_effect that branches `list_files` calls on `file_type`.

    `_create_summary_from_results` calls `list_files` twice:
      - once with `file_type="content_extraction"` to find the existing summary
      - once with `file_type="document"` to reconcile against active docs
    """
    summary_files = summary_files or []
    document_files = document_files or []

    async def _side_effect(list_input: Any) -> list[Any]:
        if list_input.file_type == "content_extraction":
            return summary_files
        if list_input.file_type == "document":
            return document_files
        return []

    return _side_effect


@pytest.mark.asyncio
class TestCreateSummaryFromResults:
    """Tests for _create_summary_from_results DMS summary activity."""

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_creates_new_summary_when_none_exists(
        self, mock_list: Any, mock_upload: Any, mock_activity: Any
    ) -> None:
        """Test that a fresh summary.json is created when none exists."""
        mock_activity.logger = MagicMock()
        doc1_id, doc2_id = uuid4(), uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[],
            document_files=[
                _make_dms_file("doc1.pdf", file_id=doc1_id),
                _make_dms_file("doc2.pdf", file_id=doc2_id),
            ],
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[
                _make_result("doc1.pdf", "doc1.pdf", file_id=doc1_id),
                _make_result("doc2.pdf", "doc2.pdf", file_id=doc2_id),
            ],
            project_id=uuid4(),
            base_metadata=_make_base_metadata(),
            total_duration_seconds=42.5,
        )

        result = await _create_summary_from_results(input_data)

        assert isinstance(result, SummaryResult)
        assert result.filename == "summary.json"

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert len(uploaded_data["processed_files"]) == 2
        assert uploaded_data["total_duration_seconds"] == 42.5
        assert uploaded_data["base_metadata"]["planned_project"] == "Autobahn A100"

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_merges_existing_summary_with_new_results(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """Existing entries are merged with new ones when both refer to active docs."""
        mock_activity.logger = MagicMock()

        existing_file_id = uuid4()
        old_doc_id = uuid4()
        new_doc_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json", existing_file_id)],
            document_files=[
                _make_dms_file("old_doc.pdf", file_id=old_doc_id),
                _make_dms_file("new_doc.pdf", file_id=new_doc_id),
            ],
        )
        mock_download.return_value = _make_existing_summary_bytes(
            [
                {
                    "document_name": "old_doc.pdf",
                    "document_path": "old_doc.pdf",
                    "processed_json_file_id": str(uuid4()),
                    "source_file_id": str(old_doc_id),
                }
            ]
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[_make_result("new_doc.pdf", "new_doc.pdf", file_id=new_doc_id)],
            project_id=uuid4(),
            base_metadata=_make_base_metadata(),
            total_duration_seconds=20.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        paths = {entry["document_path"] for entry in uploaded_data["processed_files"]}
        assert paths == {"old_doc.pdf", "new_doc.pdf"}
        assert uploaded_data["total_duration_seconds"] == 20.0
        mock_delete.assert_awaited_once_with(existing_file_id)

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_new_entry_overrides_existing_with_same_path(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """Re-processing the same document_path replaces the stale entry."""
        mock_activity.logger = MagicMock()

        stale_json_id = str(uuid4())
        doc_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("doc.pdf", file_id=doc_id)],
        )
        mock_download.return_value = _make_existing_summary_bytes(
            [
                {
                    "document_name": "doc.pdf",
                    "document_path": "doc.pdf",
                    "processed_json_file_id": stale_json_id,
                    "source_file_id": str(doc_id),
                }
            ]
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[_make_result("doc.pdf", "doc.pdf", file_id=doc_id)],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=3.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert len(uploaded_data["processed_files"]) == 1
        entry = uploaded_data["processed_files"][0]
        assert entry["document_path"] == "doc.pdf"
        assert entry["processed_json_file_id"] != stale_json_id

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_reconcile_drops_entries_not_in_active_documents(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """Entries for documents no longer in DMS are removed by reconciliation."""
        mock_activity.logger = MagicMock()

        # Existing summary has two docs, but only one is still an active DOCUMENT file
        kept_id = uuid4()
        removed_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("kept.pdf", file_id=kept_id)],
        )
        mock_download.return_value = _make_existing_summary_bytes(
            [
                {
                    "document_name": "kept.pdf",
                    "document_path": "kept.pdf",
                    "processed_json_file_id": str(uuid4()),
                    "source_file_id": str(kept_id),
                },
                {
                    "document_name": "removed.pdf",
                    "document_path": "removed.pdf",
                    "processed_json_file_id": str(uuid4()),
                    "source_file_id": str(removed_id),
                },
            ]
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=0.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        paths = [entry["document_path"] for entry in uploaded_data["processed_files"]]
        assert paths == ["kept.pdf"]

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_corrupt_existing_summary_logs_and_proceeds(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """A corrupt existing summary must not block the new upload."""
        mock_activity.logger = MagicMock()

        _corrupt_doc_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("doc.pdf", file_id=_corrupt_doc_id)],
        )
        mock_download.return_value = b"not-valid-json{{{"

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[_make_result("doc.pdf", "doc.pdf", file_id=_corrupt_doc_id)],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=1.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert [e["document_path"] for e in uploaded_data["processed_files"]] == ["doc.pdf"]
        mock_activity.logger.warning.assert_called()

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_delete_old_summary_failure_is_non_fatal(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """Failure to delete the old summary must not raise."""
        mock_activity.logger = MagicMock()

        delete_doc_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("doc.pdf", file_id=delete_doc_id)],
        )
        mock_download.return_value = _make_existing_summary_bytes([])

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result
        mock_delete.side_effect = Exception("DMS delete failed")

        input_data = CreateSummaryFromResultsInput(
            results=[_make_result("doc.pdf", "doc.pdf", file_id=delete_doc_id)],
            project_id=uuid4(),
            base_metadata=_make_base_metadata(),
            total_duration_seconds=1.0,
        )

        result = await _create_summary_from_results(input_data)
        assert isinstance(result, SummaryResult)
        mock_activity.logger.warning.assert_called()

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_no_base_metadata(
        self, mock_list: Any, mock_upload: Any, mock_activity: Any
    ) -> None:
        """Summary is created with null base_metadata when not provided."""
        mock_activity.logger = MagicMock()
        no_meta_doc_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[],
            document_files=[_make_dms_file("doc.pdf", file_id=no_meta_doc_id)],
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[_make_result("doc.pdf", "doc.pdf", file_id=no_meta_doc_id)],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=1.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert uploaded_data["base_metadata"] is None

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_reconcile_refreshes_paths_after_rename(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """An existing entry whose document was renamed survives with refreshed path.

        Reconciliation is keyed by source_file_id, so the entry stays even
        though its stored document_path no longer matches the active filename;
        document_path and document_name are updated to the current filename.
        """
        mock_activity.logger = MagicMock()

        renamed_doc_id = uuid4()
        stale_json_id = str(uuid4())
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("renamed_doc.pdf", file_id=renamed_doc_id)],
        )
        mock_download.return_value = _make_existing_summary_bytes(
            [
                {
                    "document_name": "old_doc.pdf",
                    "document_path": "old_doc.pdf",
                    "processed_json_file_id": stale_json_id,
                    "source_file_id": str(renamed_doc_id),
                }
            ]
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        input_data = CreateSummaryFromResultsInput(
            results=[],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=0.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert len(uploaded_data["processed_files"]) == 1
        entry = uploaded_data["processed_files"][0]
        assert entry["document_path"] == "renamed_doc.pdf"
        assert entry["document_name"] == "renamed_doc.pdf"
        assert entry["source_file_id"] == str(renamed_doc_id)
        # processed_json_file_id is unchanged — only display fields are refreshed
        assert entry["processed_json_file_id"] == stale_json_id

    @patch("src.activities.postprocessing.summary.activity")
    @patch("src.activities.postprocessing.summary.delete_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.upload_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.download_file", new_callable=AsyncMock)
    @patch("src.activities.postprocessing.summary.list_files", new_callable=AsyncMock)
    async def test_existing_entry_without_source_file_id_is_dropped(
        self,
        mock_list: Any,
        mock_download: Any,
        mock_upload: Any,
        mock_delete: Any,
        mock_activity: Any,
    ) -> None:
        """An existing entry without source_file_id is ignored during merge;
        only the new id-based entry survives.
        """
        mock_activity.logger = MagicMock()

        doc_id = uuid4()
        new_json_id = uuid4()
        mock_list.side_effect = _make_list_files_side_effect(
            summary_files=[_make_dms_file("summary.json")],
            document_files=[_make_dms_file("doc.pdf", file_id=doc_id)],
        )
        mock_download.return_value = _make_existing_summary_bytes(
            [
                {
                    "document_name": "doc.pdf",
                    "document_path": "doc.pdf",
                    "processed_json_file_id": str(uuid4()),
                }
            ]
        )

        upload_result = MagicMock()
        upload_result.id = uuid4()
        mock_upload.return_value = upload_result

        new_result = SingleDocumentWorkflowOutput(
            final_json_file_id=new_json_id,
            file_id=str(doc_id),
            document_name="doc.pdf",
            document_path="doc.pdf",
        )
        input_data = CreateSummaryFromResultsInput(
            results=[new_result],
            project_id=uuid4(),
            base_metadata=None,
            total_duration_seconds=1.0,
        )

        await _create_summary_from_results(input_data)

        uploaded_data = json.loads(mock_upload.call_args.args[0].data)
        assert len(uploaded_data["processed_files"]) == 1
        entry = uploaded_data["processed_files"][0]
        assert entry["processed_json_file_id"] == str(new_json_id)
        assert entry["source_file_id"] == str(doc_id)
