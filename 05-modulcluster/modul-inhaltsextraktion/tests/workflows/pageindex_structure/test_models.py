"""Tests for pageindex_structure Pydantic models (output_format + types)."""

from src.workflows.pageindex_structure.types import (
    NodeSummaryResponse,
    RecursiveSummaryResponse,
)


class TestNodeSummaryResponse:
    """Tests for the NodeSummaryResponse model."""

    def test_creation(self) -> None:
        """Test that NodeSummaryResponse stores the summary field."""
        resp = NodeSummaryResponse(summary="This section covers...")
        assert resp.summary == "This section covers..."


class TestRecursiveSummaryResponse:
    """Tests for the RecursiveSummaryResponse model."""

    def test_creation(self) -> None:
        """Test that RecursiveSummaryResponse stores the summary field."""
        resp = RecursiveSummaryResponse(summary="Aggregated summary")
        assert resp.summary == "Aggregated summary"
