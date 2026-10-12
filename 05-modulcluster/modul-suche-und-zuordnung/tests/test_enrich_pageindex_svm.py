"""
Tests for pure functions in the pageindex_svm package.

Tests cover preparation (tokenization, truncation, node mapping, batching).
"""

import pytest
from temporal.contracts import (
    SucheZuordnungDocument as Document,
)
from temporal.contracts import (
    SucheZuordnungDocumentNode as DocumentNode,
)

from src.config import CONFIG
from src.pageindex_svm.preparation import (
    _identify_chunks_to_filter,
    _split_node_into_chunks,
    build_stage2_batches,
    count_tokens,
    create_node_mapping,
    prepare_stage1,
    truncate_research_report,
)

# ---------------------------------------------------------------------------
# Constants for PLR2004 (magic value replacements)
# ---------------------------------------------------------------------------

EXPECTED_NODE_COUNT_THREE = 3
EXPECTED_NODE_COUNT_ONE = 1
EXPECTED_BATCH_COUNT_ONE = 1
EXPECTED_BATCH_COUNT_TWO = 2
EXPECTED_CHUNKS_IN_BATCH = 2
EXPECTED_TAIL_BATCH_SIZE = 1
MAX_CHUNKS_PER_BATCH_TWO = 2


def _node(
    node_id: str,
    title: str = "",
    text: str = "",
    summary: str = "",
    chunk_ids: list[str] | None = None,
    page_numbers: list[int] | None = None,
) -> DocumentNode:
    """Helper to create a DocumentNode for tests."""
    return DocumentNode(
        node_id=node_id,
        title=title,
        text=text,
        summary=summary,
        chunk_ids=chunk_ids or [],
        page_numbers=page_numbers or [],
    )


# ---------------------------------------------------------------------------
# count_tokens
# ---------------------------------------------------------------------------


class TestCountTokens:
    """Tests for count_tokens that measures token count for input text."""

    def test_empty_string_returns_zero(self) -> None:
        """Verify that an empty string has a token count of zero."""
        assert count_tokens("") == 0

    def test_nonempty_string_returns_positive_int(self) -> None:
        """Verify that a non-empty string returns a positive integer token count."""
        count = count_tokens("Das Vorhaben ist zulässig.")
        assert isinstance(count, int)
        assert count > 0

    def test_longer_text_has_more_tokens(self) -> None:
        """Verify that a longer text produces a higher token count than a shorter one."""
        short = count_tokens("Kurz.")
        long = count_tokens("Das ist ein sehr viel längerer Text mit mehr Wörtern und Tokens.")
        assert long > short


# ---------------------------------------------------------------------------
# truncate_research_report
# ---------------------------------------------------------------------------


class TestTruncateResearchReport:
    """Tests for truncate_research_report that shortens overlong research report text."""

    def test_empty_string_returns_empty(self) -> None:
        """Verify that an empty input string is returned unchanged."""
        assert truncate_research_report("") == ""

    def test_short_text_returned_unchanged(self) -> None:
        """Verify that text within the token limit is returned without modification."""
        text = "Kurzer Bericht."
        assert truncate_research_report(text, max_tokens=2000) == text

    def test_long_text_is_truncated(self) -> None:
        """Verify that text exceeding the token limit is shortened and contains the truncation marker."""
        long_text = "Das Vorhaben ist zulässig. " * 200
        result = truncate_research_report(long_text, max_tokens=50)
        assert len(result) < len(long_text)
        assert "gekürzt" in result.lower()

    def test_truncated_text_ends_with_marker(self) -> None:
        """Verify that truncated output always ends with the '[... Report gekürzt ...]' marker."""
        long_text = "Wort " * 500
        result = truncate_research_report(long_text, max_tokens=10)
        assert result.endswith("[... Report gekürzt ...]")

    def test_text_exactly_at_limit_not_truncated(self) -> None:
        """Verify that text exactly at the token limit is returned unchanged."""
        text = "Ein Satz."
        token_count = count_tokens(text)
        result = truncate_research_report(text, max_tokens=token_count)
        assert result == text


# ---------------------------------------------------------------------------
# create_node_mapping
# ---------------------------------------------------------------------------


class TestCreateNodeMapping:
    """Tests for create_node_mapping that builds a flat node_id-to-node dict from a tree structure."""

    def test_empty_structure_returns_empty(self) -> None:
        """Verify that an empty structure list produces an empty mapping."""
        assert create_node_mapping([]) == {}

    def test_flat_structure_mapped_by_node_id(self) -> None:
        """Verify that top-level nodes are accessible by their node_id in the mapping."""
        nodes = [_node("n1", title="Section 1", text="T1"), _node("n2", title="Section 2", text="T2")]
        result = create_node_mapping(nodes)
        assert "n1" in result
        assert "n2" in result
        assert result["n1"].title == "Section 1"

    def test_all_nodes_mapped(self) -> None:
        """Verify that all nodes are included in the mapping."""
        nodes = [_node("a"), _node("b"), _node("c")]
        result = create_node_mapping(nodes)
        assert len(result) == EXPECTED_NODE_COUNT_THREE

    def test_single_node(self) -> None:
        """Verify that a single node produces exactly one mapping entry."""
        nodes = [_node("solo", title="Solo")]
        result = create_node_mapping(nodes)
        assert len(result) == EXPECTED_NODE_COUNT_ONE


# ---------------------------------------------------------------------------
# build_stage2_batches
# (MAX_CHUNKS_PER_BATCH=1, available_tokens=8000)
# ---------------------------------------------------------------------------


class TestBuildStage2Batches:
    """Tests for build_stage2_batches that groups nodes into token-bounded batches for stage-2 processing."""

    def test_empty_input_returns_empty(self) -> None:
        """Verify that an empty chunk list produces no batches."""
        assert build_stage2_batches([]) == []

    def test_single_chunk_becomes_one_batch(self) -> None:
        """Verify that a single chunk is placed into exactly one batch."""
        chunks = [{"node_id": "n1", "tokens": 100}]
        batches = build_stage2_batches(chunks)
        assert len(batches) == 1
        assert batches[0] == chunks

    def test_two_small_chunks_fit_in_one_batch(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify that two small chunks fit in one batch when MAX_CHUNKS_PER_BATCH >= 2."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "MAX_CHUNKS_PER_BATCH", MAX_CHUNKS_PER_BATCH_TWO)
        chunks = [
            {"node_id": "n1", "tokens": 100},
            {"node_id": "n2", "tokens": 200},
        ]
        batches = build_stage2_batches(chunks)
        assert len(batches) == EXPECTED_BATCH_COUNT_ONE
        assert len(batches[0]) == EXPECTED_CHUNKS_IN_BATCH

    def test_oversized_chunk_gets_own_batch(self) -> None:
        """Verify that a chunk exceeding the available token budget is placed in its own batch."""
        chunks = [{"node_id": "huge", "tokens": 9000}]
        batches = build_stage2_batches(chunks)
        assert len(batches) == 1
        assert batches[0] == chunks

    def test_oversized_chunk_flushes_current_batch(self) -> None:
        """Verify that an oversized chunk flushes any accumulated batch before starting its own."""
        chunks = [
            {"node_id": "n1", "tokens": 100},
            {"node_id": "huge", "tokens": 9000},
        ]
        batches = build_stage2_batches(chunks)
        assert len(batches) == EXPECTED_BATCH_COUNT_TWO

    def test_each_batch_is_a_list(self) -> None:
        chunks = [{"node_id": "n1", "tokens": 10}, {"node_id": "n2", "tokens": 10}]
        batches = build_stage2_batches(chunks)
        assert all(isinstance(b, list) for b in batches)

    def test_zero_tokens_chunk(self) -> None:
        chunks = [{"node_id": "n1", "tokens": 0}]
        batches = build_stage2_batches(chunks)
        assert len(batches) == 1

    def test_batch_count_limit_triggers_new_batch(self) -> None:
        """When MAX_CHUNKS_PER_BATCH is exceeded, a new batch is started."""
        limit = CONFIG.PAGEINDEX_SVM.MAX_CHUNKS_PER_BATCH
        # Create limit+1 chunks, each small enough to fit token-wise
        chunks = [{"node_id": f"n{i}", "tokens": 10} for i in range(limit + 1)]
        batches = build_stage2_batches(chunks)
        assert len(batches) == EXPECTED_BATCH_COUNT_TWO
        assert len(batches[0]) == limit
        assert len(batches[1]) == EXPECTED_TAIL_BATCH_SIZE


# ---------------------------------------------------------------------------
# prepare_stage1
# ---------------------------------------------------------------------------


class TestPrepareStage1:
    """Tests for prepare_stage1 that builds the stage-1 LLM prompt from a document tree."""

    def test_returns_none_prompt_when_tokens_exceed_limit(self) -> None:
        node = DocumentNode(
            node_id="n1", title="Very long title", text="x" * 1000, summary="", chunk_ids=[], page_numbers=[]
        )
        doc = Document(file_id="f1", document_name="Test", nodes=[node])
        prompt, node_map, index_to_node_id = prepare_stage1(
            doc, "BauGB § 35", "TBM text", "Research report", max_input_tokens=1
        )
        assert prompt is None
        assert "n1" in node_map
        assert 0 in index_to_node_id


# ---------------------------------------------------------------------------
# _split_node_into_chunks
# ---------------------------------------------------------------------------


class TestSplitNodeIntoChunks:
    """Tests for _split_node_into_chunks that splits a document node into token-bounded chunks."""

    def test_small_node_fits_in_single_chunk(self) -> None:
        node = DocumentNode(node_id="n1", title="T", text="Kurzer Text.", summary="", chunk_ids=[], page_numbers=[])
        chunks = _split_node_into_chunks("n1", node, max_chunk_tokens=500)
        assert len(chunks) == 1
        assert chunks[0]["node_id"] == "n1"
        assert chunks[0]["text"] == "Kurzer Text."

    def test_oversized_node_splits_at_sentence_boundary(self) -> None:
        # Create text with clear sentence boundaries that exceeds a small token budget
        text = "Erster Satz. " * 20 + "Zweiter Satz. " * 20
        node = DocumentNode(node_id="n1", title="T", text=text, summary="", chunk_ids=[], page_numbers=[])
        # Use a very small token budget to force splitting
        chunks = _split_node_into_chunks("n1", node, max_chunk_tokens=20)
        assert len(chunks) > 1
        # All original sentences should appear across chunks
        all_text = " ".join(c["text"] for c in chunks)
        assert "Erster Satz." in all_text
        assert "Zweiter Satz." in all_text
        # No chunk exceeds the token budget (except single-sentence overflow)
        for chunk in chunks:
            # Allow slight overflow for single sentences
            assert count_tokens(chunk["text"]) <= 20 * 3

    def test_empty_node_text_returns_no_chunks(self) -> None:
        # _identify_chunks_to_filter skips nodes with empty text
        node = DocumentNode(node_id="n1", title="T", text="", summary="", chunk_ids=[], page_numbers=[])
        node_map = {"n1": node}
        chunks = _identify_chunks_to_filter(["n1"], node_map)
        assert chunks == []
