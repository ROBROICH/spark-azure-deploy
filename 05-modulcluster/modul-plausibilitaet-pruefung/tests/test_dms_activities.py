"""Tests for DMS Temporal activities (thin wrappers + aggregation)."""

from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.dms_activities import (
    AggregateCheckpointsInput,
    UploadTemporalCheckpointInput,
    aggregate_and_upload_checkpoints,
    fetch_erlauterungsbericht_document_ids,
    fetch_project_metadata,
    upload_temporal_checkpoint,
)
from src.dms.schemas import (
    BaseMetadata,
    DMSFileResponse,
    ProjectBaseMetadataStatus,
)


@pytest.fixture
def mock_dms() -> Generator[MagicMock]:
    with patch("src.activities.dms_activities.dms_client") as mock:
        yield mock


def _dms_file(file_id: str = "f1", filename: str = "x.json") -> DMSFileResponse:
    return DMSFileResponse(
        id=file_id, type="file", filename=filename,
        bucketPath="/x", projectId="p",
    )


class TestFetchErlauterungsberichtDocumentIds:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_classification_id(self, mock_dms: MagicMock) -> None:
        result = await fetch_erlauterungsbericht_document_ids(None)
        assert result == []

    @pytest.mark.asyncio
    async def test_delegates_to_client(self, mock_dms: MagicMock) -> None:
        mock_dms.fetch_erlauterungsbericht_document_ids = AsyncMock(return_value=["doc-1"])
        result = await fetch_erlauterungsbericht_document_ids("classification-1")
        assert result == ["doc-1"]
        mock_dms.fetch_erlauterungsbericht_document_ids.assert_awaited_once_with("classification-1")


class TestFetchProjectMetadata:
    @pytest.mark.asyncio
    async def test_wraps_client_tuple_response(self, mock_dms: MagicMock) -> None:
        meta = BaseMetadata.fallback_unknown("p")
        mock_dms.get_project_base_metadata = AsyncMock(
            return_value=(meta, ProjectBaseMetadataStatus.COMPLETE)
        )
        result = await fetch_project_metadata("p")
        assert result.metadata == meta
        assert result.status == ProjectBaseMetadataStatus.COMPLETE


class TestUploadTemporalCheckpoint:
    @pytest.mark.asyncio
    async def test_delegates_with_unpacked_params(self, mock_dms: MagicMock) -> None:
        mock_dms.upload_temporal_checkpoint = AsyncMock(return_value=_dms_file())
        result = await upload_temporal_checkpoint(
            UploadTemporalCheckpointInput(
                project_id="p", workflow_id="w", run_id="r",
                filename="file.json", payload={"x": 1},
            )
        )
        assert result.id == "f1"
        mock_dms.upload_temporal_checkpoint.assert_awaited_once_with(
            project_id="p", workflow_id="w", run_id="r",
            filename="file.json", payload={"x": 1},
        )


class TestAggregateAndUploadCheckpoints:
    @pytest.mark.asyncio
    async def test_concatenates_contradictions_from_all_files(self, mock_dms: MagicMock) -> None:
        download_responses = [
            {"contradictions": [{"id": "a"}]},
            {"contradictions": [{"id": "b"}, {"id": "c"}]},
            {"other_field": "ignored"},  # missing key → silently skipped
        ]

        async def fake_download(*, file_id: str) -> Any:
            return download_responses.pop(0)

        mock_dms.download_json = AsyncMock(side_effect=fake_download)
        mock_dms.upload_temporal_checkpoint = AsyncMock(return_value=_dms_file("agg"))

        result = await aggregate_and_upload_checkpoints(
            AggregateCheckpointsInput(
                project_id="p", workflow_id="w", run_id="r",
                filename="agg.json", file_ids=["f1", "f2", "f3"],
            )
        )

        assert result.id == "agg"
        upload_call = mock_dms.upload_temporal_checkpoint.await_args
        assert upload_call is not None
        assert upload_call.kwargs["payload"] == {
            "contradictions": [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        }
