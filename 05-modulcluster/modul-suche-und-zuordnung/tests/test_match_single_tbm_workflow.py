"""
Tests for src/workflows/match_single_tbm_workflow.py

_aggregate_to_documents is a pure function — tested directly.
MatchedDocument and MatchSingleTBMWorkflowOutput are Pydantic models.

MatchSingleTBMWorkflowInput is already covered in test_temporal_workflows.py.
"""

from typing import Any

from src.workflows.match_single_tbm_workflow import (
    MatchedDocument,
    MatchSingleTBMWorkflowOutput,
    _aggregate_to_documents,
)

EXPECTED_DOCUMENT_COUNT = 2

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
# _aggregate_to_documents
# ---------------------------------------------------------------------------


class TestAggregateChunksToDocuments:
    """Tests for the _aggregate_to_documents pure function."""

    def test_empty_input_returns_empty(self) -> None:
        """Verify that an empty chunk list yields an empty result."""
        assert _aggregate_to_documents([]) == []

    def test_groups_chunks_by_document_id(self) -> None:
        """Verify that chunks sharing a document_id are collapsed into one result entry."""
        chunks = [
            {"document_id": "doc1", "title": "Doc 1", "score": 0.9},
            {"document_id": "doc1", "title": "Doc 1", "score": 0.8},
            {"document_id": "doc2", "title": "Doc 2", "score": 0.7},
        ]
        result = _aggregate_to_documents(chunks)
        assert len(result) == EXPECTED_DOCUMENT_COUNT

    def test_sorts_by_best_score_descending(self) -> None:
        """Verify that documents are ordered by their highest chunk score, descending."""
        chunks = [
            {"document_id": "low", "score": 0.3},
            {"document_id": "high", "score": 0.9},
            {"document_id": "mid", "score": 0.6},
        ]
        result = _aggregate_to_documents(chunks)
        assert result[0].document_id == "high"
        assert result[1].document_id == "mid"
        assert result[2].document_id == "low"

    def test_keeps_highest_score_per_document(self) -> None:
        """Verify that only the best score is retained when a document has multiple chunks."""
        chunks = [
            {"document_id": "doc1", "score": 0.5},
            {"document_id": "doc1", "score": 0.9},
            {"document_id": "doc1", "score": 0.3},
        ]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1

    def test_skips_chunks_without_any_id(self) -> None:
        """Verify that chunks with no identifier fields are excluded from the result."""
        chunks = [{"score": 0.9, "page_numbers": [1]}]
        assert _aggregate_to_documents(chunks) == []

    def test_falls_back_to_document_name_when_no_document_id(self) -> None:
        """Verify that document_name is used as the identifier when document_id is absent."""
        chunks = [{"document_name": "MyDoc", "score": 0.5}]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1
        assert result[0].document_id == "MyDoc"

    def test_falls_back_to_title_when_no_document_id_or_name(self) -> None:
        """Verify that title is used as the identifier when both document_id and document_name are absent."""
        chunks = [{"title": "My Title", "score": 0.5}]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1

    def test_document_id_takes_priority_over_document_name(self) -> None:
        """Verify that document_id is preferred over document_name when both are present."""
        chunks = [{"document_id": "real-id", "document_name": "name", "score": 0.5}]
        result = _aggregate_to_documents(chunks)
        assert result[0].document_id == "real-id"

    def test_none_score_treated_as_zero(self) -> None:
        """Verify that a None score is treated as zero during sorting."""
        chunks: list[dict[str, Any]] = [
            {"document_id": "doc1", "score": None},
            {"document_id": "doc2", "score": 0.5},
        ]
        result = _aggregate_to_documents(chunks)
        assert result[0].document_id == "doc2"

    def test_preserves_title_in_output(self) -> None:
        """Verify that the document title is carried through to the output MatchedDocument."""
        chunks = [{"document_id": "doc1", "title": "Erläuterungsbericht", "score": 0.5}]
        result = _aggregate_to_documents(chunks)
        assert result[0].title == "Erläuterungsbericht"

    def test_handles_page_numbers_without_crashing(self) -> None:
        """Verify that page_numbers and related fields are handled without errors."""
        chunks = [
            {
                "document_id": "doc1",
                "page_numbers": [1, 2, 3],
                "parent_page_numbers": [0],
                "chunk_id": "c1",
                "score": 0.5,
            }
        ]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1

    def test_handles_non_list_page_numbers_without_crashing(self) -> None:
        """Verify that a non-list page_numbers value does not raise an error."""
        chunks: list[dict[str, Any]] = [{"document_id": "doc1", "page_numbers": None, "score": 0.5}]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1

    def test_multiple_chunks_same_document_one_result(self) -> None:
        """Verify that multiple chunks for the same document collapse to a single result."""
        chunks = [
            {"document_id": "doc1", "chunk_id": "c1", "score": 0.4},
            {"document_id": "doc1", "chunk_id": "c2", "score": 0.6},
            {"document_id": "doc1", "chunk_id": "c3", "score": 0.5},
        ]
        result = _aggregate_to_documents(chunks)
        assert len(result) == 1
