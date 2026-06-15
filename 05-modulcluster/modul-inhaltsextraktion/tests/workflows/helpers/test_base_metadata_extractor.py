# tests/workflows/helpers/test_base_metadata_extractor.py
"""Tests for base_metadata_extractor helper functions."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from temporal.workflows.inhaltsextraktion.types import BaseMetadata

from src.workflows.helpers.base_metadata_extractor import (
    consolidate_base_metadata,
    _gather_evidence_from_chunks,
    extract_base_metadata,
)


class TestGatherEvidenceFromChunks:
    """Tests for _gather_evidence_from_chunks function."""

    @pytest.mark.asyncio
    async def test_gather_evidence_empty_content(self) -> None:
        """Test gathering evidence from empty content."""
        with patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm:
            result = await _gather_evidence_from_chunks("", chunk_size=1000)
            assert result == []
            mock_llm.assert_not_called()

    @pytest.mark.asyncio
    async def test_gather_evidence_single_chunk(self) -> None:
        """Test gathering evidence from a single chunk."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm,
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
        ):
            mock_result = MagicMock()
            mock_result.model_dump.return_value = {"project_name": "Test Project"}
            mock_llm.return_value = mock_result
            mock_workflow.logger = MagicMock()

            result = await _gather_evidence_from_chunks("Test content here", chunk_size=1000)

            assert len(result) == 1
            assert result[0]["project_name"] == "Test Project"

    @pytest.mark.asyncio
    async def test_gather_evidence_multiple_chunks(self) -> None:
        """Test gathering evidence from multiple chunks."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm,
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
        ):
            mock_result = MagicMock()
            mock_result.model_dump.return_value = {"project_name": "Test"}
            mock_llm.return_value = mock_result
            mock_workflow.logger = MagicMock()

            # Content that will be split into 3 chunks of 10 chars each
            content = "0123456789" * 3
            result = await _gather_evidence_from_chunks(content, chunk_size=10)

            assert len(result) == 3
            assert mock_llm.call_count == 3

    @pytest.mark.asyncio
    async def test_gather_evidence_handles_exceptions(self) -> None:
        """Test that exceptions are logged and skipped."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm,
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
        ):
            # First call succeeds, second fails
            mock_success = MagicMock()
            mock_success.model_dump.return_value = {"project_name": "Success"}
            mock_llm.side_effect = [mock_success, Exception("LLM Error")]
            mock_workflow.logger = MagicMock()

            content = "0123456789" * 2
            result = await _gather_evidence_from_chunks(content, chunk_size=10)

            # Should only have one result (the successful one)
            assert len(result) == 1
            mock_workflow.logger.error.assert_called_once()

    @pytest.mark.asyncio
    async def test_gather_evidence_filters_empty_results(self) -> None:
        """Test that empty evidence results are filtered out."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm,
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
        ):
            # Return empty dict (no evidence found)
            mock_result = MagicMock()
            empty_evidence: dict[str, Any] = {}
            mock_result.model_dump.return_value = empty_evidence
            mock_llm.return_value = mock_result
            mock_workflow.logger = MagicMock()

            result = await _gather_evidence_from_chunks("Test content", chunk_size=1000)

            # Empty results should be filtered out
            assert len(result) == 0


class TestConsolidateEvidence:
    """Tests for consolidate_base_metadata function."""

    @pytest.mark.asyncio
    async def test_consolidate_base_metadata_success(self) -> None:
        """Test successful evidence consolidation."""
        with patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm:
            mock_result = MagicMock()
            mock_result.model_dump.return_value = {
                "project_name": "Consolidated Project",
                "applicant": "Test Applicant",
            }
            mock_llm.return_value = mock_result

            all_evidence = [
                {"project_name": "Project A"},
                {"project_name": "Project B", "applicant": "Test Applicant"},
            ]

            result = await consolidate_base_metadata(all_evidence, project_id="project-123")

            assert isinstance(result, BaseMetadata)
            assert result.application_id == "project-123"

    @pytest.mark.asyncio
    async def test_consolidate_base_metadata_failure_returns_default(self) -> None:
        """Test that consolidation failure returns default metadata."""
        with patch("src.workflows.helpers.base_metadata_extractor.llm_invoke_structured") as mock_llm:
            mock_llm.side_effect = Exception("LLM consolidation failed")

            all_evidence = [{"project_name": "Test"}]

            result = await consolidate_base_metadata(all_evidence, project_id="project-456")

            assert isinstance(result, BaseMetadata)
            assert result.application_id == "project-456"

    @pytest.mark.asyncio
    async def test_consolidate_base_metadata_empty_evidence(self) -> None:
        """Test that empty evidence returns default metadata."""
        result = await consolidate_base_metadata([], project_id="project-789")

        assert isinstance(result, BaseMetadata)
        assert result.application_id == "project-789"


class TestExtractBaseMetadata:
    """Tests for extract_base_metadata function."""

    @pytest.mark.asyncio
    async def test_extract_metadata_no_evidence(self) -> None:
        """Test extraction when no evidence is gathered."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
            patch("src.workflows.helpers.base_metadata_extractor._gather_evidence_from_chunks") as mock_gather,
        ):
            mock_workflow.logger = MagicMock()
            empty_evidence: list[dict[str, Any]] = []
            mock_gather.return_value = empty_evidence

            result = await extract_base_metadata("Some markdown content", "project-789")

            assert isinstance(result, BaseMetadata)
            assert result.application_id == "project-789"
            mock_workflow.logger.warning.assert_called_once()

    @pytest.mark.asyncio
    async def test_extract_metadata_with_evidence(self) -> None:
        """Test extraction with evidence gathered."""
        with (
            patch("src.workflows.helpers.base_metadata_extractor.workflow") as mock_workflow,
            patch("src.workflows.helpers.base_metadata_extractor._gather_evidence_from_chunks") as mock_gather,
            patch("src.workflows.helpers.base_metadata_extractor.consolidate_base_metadata") as mock_consolidate,
        ):
            mock_workflow.logger = MagicMock()
            mock_gather.return_value = [{"project_name": "Test"}]

            expected_metadata = BaseMetadata(application_id="project-789", project_name="Test")
            mock_consolidate.return_value = expected_metadata

            result = await extract_base_metadata("Document markdown content", "project-789")

            assert result == expected_metadata
            mock_consolidate.assert_called_once()
