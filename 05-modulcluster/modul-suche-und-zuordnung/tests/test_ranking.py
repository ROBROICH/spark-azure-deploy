"""
Tests for src/tbm_matching/ranking.py — aggregate_to_documents and reciprocal_rank_fusion.
"""

from typing import Any

from src.tbm_matching.ranking import aggregate_to_documents, reciprocal_rank_fusion

# ---------------------------------------------------------------------------
# Constants for magic-value comparisons
# ---------------------------------------------------------------------------

EXPECTED_SINGLE_CHUNK_SCORE = 0.9
EXPECTED_MULTI_CHUNK_MAX_SCORE = 0.9
EXPECTED_TOP_K_COUNT = 2
EXPECTED_TOP_K_TOP_SCORE = 4.0
EXPECTED_RRF_TOP_K_COUNT = 3

# ---------------------------------------------------------------------------
# aggregate_to_documents
# ---------------------------------------------------------------------------


class TestAggregateToDocuments:
    """Tests for aggregate_to_documents grouping chunks into document entries."""

    def test_empty_input(self) -> None:
        assert aggregate_to_documents([]) == []

    def test_single_chunk(self) -> None:
        chunks = [
            {"document_id": "d1", "title": "Doc A", "project_id": "p1", "score": 0.9, "chunk_id": "c1"},
        ]
        result = aggregate_to_documents(chunks)
        assert len(result) == 1
        assert result[0]["document_id"] == "d1"
        assert result[0]["score"] == EXPECTED_SINGLE_CHUNK_SCORE
        assert result[0]["chunk_ids"] == ["c1"]

    def test_multiple_chunks_same_document(self) -> None:
        """Multiple chunks for the same doc are aggregated; highest score wins."""
        chunks = [
            {"document_id": "d1", "title": "A", "project_id": "p1", "score": 0.5, "chunk_id": "c1"},
            {"document_id": "d1", "title": "A", "project_id": "p1", "score": 0.9, "chunk_id": "c2"},
        ]
        result = aggregate_to_documents(chunks)
        assert len(result) == 1
        assert result[0]["score"] == EXPECTED_MULTI_CHUNK_MAX_SCORE
        assert result[0]["chunk_ids"] == ["c1", "c2"]

    def test_sorted_by_score_descending(self) -> None:
        chunks = [
            {"document_id": "d1", "title": "A", "score": 0.3},
            {"document_id": "d2", "title": "B", "score": 0.9},
            {"document_id": "d3", "title": "C", "score": 0.6},
        ]
        result = aggregate_to_documents(chunks)
        scores = [d["score"] for d in result]
        assert scores == sorted(scores, reverse=True)

    def test_top_k_limits_output(self) -> None:
        chunks = [{"document_id": f"d{i}", "title": f"T{i}", "score": float(i)} for i in range(5)]
        result = aggregate_to_documents(chunks, top_k=EXPECTED_TOP_K_COUNT)
        assert len(result) == EXPECTED_TOP_K_COUNT
        assert result[0]["score"] == EXPECTED_TOP_K_TOP_SCORE

    def test_page_numbers_collected(self) -> None:
        """Page numbers from chunks are unioned and sorted."""
        chunks = [
            {"document_id": "d1", "title": "A", "score": 1.0, "page_numbers": [3, 1]},
            {"document_id": "d1", "title": "A", "score": 0.5, "page_numbers": [2, 1]},
        ]
        result = aggregate_to_documents(chunks)
        assert result[0]["page_numbers"] == [1, 2, 3]

    def test_parent_page_numbers_collected(self) -> None:
        chunks = [
            {"document_id": "d1", "title": "A", "score": 1.0, "parent_page_numbers": [5, 3]},
            {"document_id": "d1", "title": "A", "score": 0.5, "parent_page_numbers": [3, 1]},
        ]
        result = aggregate_to_documents(chunks)
        assert result[0]["parent_page_numbers"] == [1, 3, 5]

    def test_skips_chunks_without_identity(self) -> None:
        """Chunks missing document_id, document_name, and title are skipped."""
        chunks: list[dict[str, Any]] = [
            {"score": 0.5},
            {"document_id": "d1", "title": "A", "score": 0.9},
        ]
        result = aggregate_to_documents(chunks)
        assert len(result) == 1
        assert result[0]["document_id"] == "d1"

    def test_document_name_fallback(self) -> None:
        """document_name is used when document_id is missing."""
        chunks = [{"document_name": "fallback_name", "score": 0.5}]
        result = aggregate_to_documents(chunks)
        assert len(result) == 1
        assert result[0]["document_id"] == "fallback_name"

    def test_duplicate_chunk_ids_not_added(self) -> None:
        """Same chunk_id is not added twice."""
        chunks = [
            {"document_id": "d1", "title": "A", "score": 0.9, "chunk_id": "c1"},
            {"document_id": "d1", "title": "A", "score": 0.8, "chunk_id": "c1"},
        ]
        result = aggregate_to_documents(chunks)
        assert result[0]["chunk_ids"] == ["c1"]

    def test_none_score_treated_as_zero(self) -> None:
        """None score is treated as 0.0."""
        chunks: list[dict[str, str | None]] = [{"document_id": "d1", "title": "A", "score": None}]
        result = aggregate_to_documents(chunks)
        assert result[0]["score"] == 0.0

    def test_non_int_page_numbers_ignored(self) -> None:
        """Non-integer page numbers are silently ignored."""
        chunks = [{"document_id": "d1", "title": "A", "score": 1.0, "page_numbers": ["a", 1, None]}]
        result = aggregate_to_documents(chunks)
        assert result[0]["page_numbers"] == [1]


# ---------------------------------------------------------------------------
# reciprocal_rank_fusion
# ---------------------------------------------------------------------------


class TestReciprocalRankFusion:
    """Tests for reciprocal_rank_fusion merging multiple ranked lists."""

    def test_empty_lists(self) -> None:
        assert reciprocal_rank_fusion([]) == []

    def test_single_list(self) -> None:
        ranked = [[{"title": "A", "document_id": "d1", "project_id": "p1"}]]
        result = reciprocal_rank_fusion(ranked, top_k=5, k=60)
        assert len(result) == 1
        assert result[0]["title"] == "A"
        assert "rrf_score" in result[0]

    def test_two_lists_overlap(self) -> None:
        """Document appearing in both lists gets higher RRF score."""
        list1 = [
            {"title": "A", "document_id": "d1", "project_id": "p1"},
            {"title": "B", "document_id": "d2", "project_id": "p1"},
        ]
        list2 = [
            {"title": "B", "document_id": "d2", "project_id": "p1"},
            {"title": "C", "document_id": "d3", "project_id": "p1"},
        ]
        result = reciprocal_rank_fusion([list1, list2], top_k=10, k=60)
        titles = [r["title"] for r in result]
        # B appears in both lists at rank 2 and rank 1, so should rank highest
        assert titles[0] == "B"

    def test_top_k_limits(self) -> None:
        ranked = [[{"title": f"T{i}", "document_id": f"d{i}", "project_id": "p1"} for i in range(10)]]
        result = reciprocal_rank_fusion(ranked, top_k=EXPECTED_RRF_TOP_K_COUNT, k=60)
        assert len(result) == EXPECTED_RRF_TOP_K_COUNT

    def test_sorted_by_rrf_score_descending(self) -> None:
        list1 = [
            {"title": "A", "document_id": "d1", "project_id": "p1"},
            {"title": "B", "document_id": "d2", "project_id": "p1"},
        ]
        result = reciprocal_rank_fusion([list1], top_k=10, k=60)
        scores = [r["rrf_score"] for r in result]
        assert scores == sorted(scores, reverse=True)

    def test_page_numbers_preserved(self) -> None:
        ranked = [[{"title": "A", "document_id": "d1", "project_id": "p1", "page_numbers": [1, 2, 3]}]]
        result = reciprocal_rank_fusion(ranked, top_k=5, k=60)
        assert result[0]["page_numbers"] == [1, 2, 3]
