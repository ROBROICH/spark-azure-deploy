"""
Tests for src/workflows/match_single_tbm_workflow.py

_fuse_tbm_results is a pure function — tested directly.
MatchedDocument and MatchSingleTBMWorkflowOutput are Pydantic models.

MatchSingleTBMWorkflowInput is already covered in test_temporal_workflows.py.
"""

from typing import Any

from src.workflows.match_single_tbm_workflow import (
    MatchedDocument,
    MatchSingleTBMWorkflowOutput,
    _fuse_tbm_results,
)

# ---------------------------------------------------------------------------
# MatchedDocument
# ---------------------------------------------------------------------------


class TestMatchedDocument:
    """Tests for MatchedDocument model construction and optional field handling."""

    def test_construction(self) -> None:
        """Verify that document_id and title are stored correctly on the model."""
        doc = MatchedDocument(document_id="doc-1", title="Erläuterungsbericht")
        assert doc.document_id == "doc-1"
        assert doc.title == "Erläuterungsbericht"

    def test_optional_fields_as_none(self) -> None:
        """Verify that document_id and title accept None as valid values."""
        doc = MatchedDocument(document_id=None, title=None)
        assert doc.document_id is None
        assert doc.title is None


# ---------------------------------------------------------------------------
# MatchSingleTBMWorkflowOutput
# ---------------------------------------------------------------------------


class TestMatchSingleTBMWorkflowOutput:
    """Tests for MatchSingleTBMWorkflowOutput model construction and matched_documents field."""

    def test_construction(self) -> None:
        """Verify that satz_key and matched_documents are stored correctly."""
        docs = [MatchedDocument(document_id="d1", title="Title")]
        output = MatchSingleTBMWorkflowOutput(
            satz_key="absatz_1/satz_1",
            matched_documents=docs,
        )
        assert output.satz_key == "absatz_1/satz_1"
        assert len(output.matched_documents) == 1

    def test_empty_matched_documents(self) -> None:
        """Verify that an empty matched_documents list is accepted and stored correctly."""
        output = MatchSingleTBMWorkflowOutput(
            satz_key="absatz_1/satz_1",
            matched_documents=[],
        )
        assert output.matched_documents == []


# ---------------------------------------------------------------------------
# _fuse_tbm_results
# ---------------------------------------------------------------------------


def _tbm(*docs: dict[str, Any]) -> dict[str, Any]:
    """One enriched TBM carrying its own ranked document list."""
    return {"svms": list(docs)}


class TestFuseTbmResults:
    """Tests for the _fuse_tbm_results pure function."""

    def test_empty_input_returns_empty(self) -> None:
        """Verify that a satz without TBM results yields an empty ranking."""
        assert _fuse_tbm_results([]) == []

    def test_tbm_without_results_is_tolerated(self) -> None:
        """Verify that a TBM with no svms key does not break the fusion."""
        enriched: list[dict[str, Any]] = [{}, _tbm({"document_id": "doc1", "title": "Doc 1"})]
        result = _fuse_tbm_results(enriched)
        assert len(result) == 1
        assert result[0].document_id == "doc1"

    def test_document_relevant_for_several_tbms_outranks_single_tbm_document(self) -> None:
        """Verify the ticket's check criterion: breadth across TBMs beats a single strong hit.

        "broad" is only rank 2 for each of the three TBMs, "narrow" is rank 1 for one of
        them. Ranking by the best single rank puts "broad" last; real fusion puts it first.
        """
        enriched = [
            _tbm({"document_id": "filler1", "title": "F1"}, {"document_id": "broad", "title": "Broad"}),
            _tbm({"document_id": "filler2", "title": "F2"}, {"document_id": "broad", "title": "Broad"}),
            _tbm({"document_id": "narrow", "title": "Narrow"}, {"document_id": "broad", "title": "Broad"}),
        ]
        result = _fuse_tbm_results(enriched)
        assert result[0].document_id == "broad"

    def test_preserves_title_in_output(self) -> None:
        """Verify that the document title is carried through to the output MatchedDocument."""
        enriched = [_tbm({"document_id": "doc1", "title": "Erläuterungsbericht"})]
        result = _fuse_tbm_results(enriched)
        assert result[0].title == "Erläuterungsbericht"
