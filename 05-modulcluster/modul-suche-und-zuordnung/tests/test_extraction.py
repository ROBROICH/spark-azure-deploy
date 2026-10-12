"""
Tests for src/pageindex_svm/extraction.py — build_result pure function.
"""

import pytest
from temporal.contracts import SucheZuordnungDocumentNode as DocumentNode

from src.pageindex_svm.extraction import build_result, combine_confidence
from src.pageindex_svm.prompts import ChunkSentenceResult, Stage2SentenceResponse

EXPECTED_NODE_COUNT_TWO = 2


def _node(
    node_id: str,
    title: str = "",
    text: str = "",
    chunk_ids: list[str] | None = None,
    page_numbers: list[int] | None = None,
) -> DocumentNode:
    return DocumentNode(
        node_id=node_id, title=title, text=text, summary="", chunk_ids=chunk_ids or [], page_numbers=page_numbers or []
    )


class TestBuildResult:
    """Tests for build_result assembling PageIndexSVMResult from Stage 2 output."""

    def test_empty_selected_nodes(self) -> None:
        """No selected nodes produces empty result."""
        result = build_result([], [], [], {}, "")
        assert result.originaltexte == []

    def test_single_node_single_batch(self) -> None:
        """Single selected node with matching stage2 response produces one entry."""
        node_map = {
            "1": _node("1", title="Title A", text="Sentence one. Sentence two.", chunk_ids=["c1"], page_numbers=[1, 2])
        }
        stage2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0], relevance=0.8),
            ]
        )
        sentence_maps = {"1": ["Sentence one.", "Sentence two."]}
        document_id = "abc"

        result = build_result(["1"], [stage2], [sentence_maps], node_map, document_id)

        assert len(result.originaltexte) == 1
        entry = result.originaltexte[0]
        assert entry.node_id == "1"
        assert entry.title == "Title A"
        assert "Sentence one." in entry.text
        assert entry.chunk_ids == ["c1"]
        assert entry.page_numbers == [1, 2]

    def test_multiple_nodes_across_batches(self) -> None:
        """Multiple nodes across two batches are merged correctly."""
        node_map = {
            "1": _node("1", title="A", text="s1. s2.", chunk_ids=["c1"]),
            "2": _node("2", title="B", text="s3. s4.", chunk_ids=["c2"]),
        }
        batch1 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[1], relevance=0.8),
            ]
        )
        batch2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="2", relevant_indices=[0, 1], relevance=0.8),
            ]
        )
        maps1 = {"1": ["s1.", "s2."]}
        maps2 = {"2": ["s3.", "s4."]}
        document_id = "abc"

        result = build_result(["1", "2"], [batch1, batch2], [maps1, maps2], node_map, document_id)

        assert len(result.originaltexte) == EXPECTED_NODE_COUNT_TWO
        assert result.originaltexte[0].node_id == "1"
        assert "s2." in result.originaltexte[0].text
        assert result.originaltexte[1].node_id == "2"
        assert "s3." in result.originaltexte[1].text

    def test_missing_node_in_map_skipped(self) -> None:
        """Nodes not present in node_map are skipped gracefully."""
        stage2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="99", relevant_indices=[0], relevance=0.8),
            ]
        )
        sentence_maps = {"99": ["text."]}

        result = build_result(["99"], [stage2], [sentence_maps], {}, "")
        assert result.originaltexte == []

    def test_missing_node_in_sentence_maps_skipped(self) -> None:
        """Nodes not in sentence_maps are skipped gracefully."""
        node_map = {"1": _node("1", title="A", text="t")}
        stage2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0], relevance=0.8),
            ]
        )
        # sentence_maps does NOT contain "1"
        sentence_maps: dict[str, list[str]] = {}
        document_id = "abc"

        result = build_result(["1"], [stage2], [sentence_maps], node_map, document_id)
        assert result.originaltexte == []

    def test_preserves_selected_nodes_order(self) -> None:
        """Output follows the order of selected_nodes, not stage2 result order."""
        node_map = {
            "3": _node("3", title="C", text="c"),
            "1": _node("1", title="A", text="a"),
        }
        stage2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0], relevance=0.8),
                ChunkSentenceResult(begruendung="reason", node_id="3", relevant_indices=[0], relevance=0.8),
            ]
        )
        maps = {"1": ["a"], "3": ["c"]}
        document_id = "abc"

        result = build_result(["3", "1"], [stage2], [maps], node_map, document_id)
        assert [e.node_id for e in result.originaltexte] == ["3", "1"]

    def test_same_node_split_across_batches_concatenated(self) -> None:
        """Same node_id in two batches — text must be concatenated, not overwritten."""
        node_map = {"1": _node("1", title="A", text="Part one. Part two.", chunk_ids=["c1"])}
        # Batch 1: node "1" with sentence index 0
        batch1 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r1", node_id="1", relevant_indices=[0], relevance=0.8)]
        )
        # Batch 2: same node "1" with sentence index 1
        batch2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r2", node_id="1", relevant_indices=[1], relevance=0.8)]
        )
        maps1 = {"1": ["Part one.", "Part two."]}
        maps2 = {"1": ["Part one.", "Part two."]}

        result = build_result(["1"], [batch1, batch2], [maps1, maps2], node_map, "doc1")
        assert len(result.originaltexte) == 1
        entry = result.originaltexte[0]
        assert "Part one." in entry.text
        assert "Part two." in entry.text


class TestConfidence:
    """Tests for the confidence value and both raw signals on each entry."""

    def test_combines_both_signals(self) -> None:
        """With a consensus ratio present, confidence is the relevance discounted by that ratio."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=0.4)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios={"1": 1.0})

        entry = result.originaltexte[0]
        assert entry.consensus_ratio == pytest.approx(1.0)
        assert entry.relevance == pytest.approx(0.4)
        # Full agreement leaves the Stage 2 value untouched.
        assert entry.confidence == pytest.approx(0.4)

    def test_partial_consensus_lowers_the_entry_value(self) -> None:
        """An entry one run did not select scores below its Stage 2 value."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=0.9)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios={"1": 2 / 3})

        # Two thirds of the Stage 2 value.
        assert result.originaltexte[0].confidence == pytest.approx(0.6)

    def test_falls_back_to_stage2_without_consensus(self) -> None:
        """Without a consensus ratio, the Stage 2 value alone is the confidence."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=0.6)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios=None)

        entry = result.originaltexte[0]
        assert entry.consensus_ratio is None
        assert entry.confidence == pytest.approx(0.6)

    def test_uses_consensus_alone_without_relevance(self) -> None:
        """Without a Stage 2 relevance value, the consensus rate alone is the confidence."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=None)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios={"1": 1.0})

        entry = result.originaltexte[0]
        assert entry.relevance is None
        assert entry.confidence == pytest.approx(1.0)

    def test_no_signal_leaves_confidence_absent(self) -> None:
        """Without either signal, the entry carries no confidence."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=None)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios=None)

        entry = result.originaltexte[0]
        assert entry.consensus_ratio is None
        assert entry.relevance is None
        assert entry.confidence is None
        # The evidence match itself survives the missing score.
        assert "a" in entry.text

    def test_split_node_ignores_absent_relevance(self) -> None:
        """A batch without a relevance value does not lower the mean."""
        node_map = {"1": _node("1", title="A", text="Part one. Part two.")}
        batch1 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r1", node_id="1", relevant_indices=[0], relevance=0.8)]
        )
        batch2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r2", node_id="1", relevant_indices=[1], relevance=None)]
        )
        maps = {"1": ["Part one.", "Part two."]}

        result = build_result(["1"], [batch1, batch2], [maps, maps], node_map, "doc", consensus_ratios=None)

        assert result.originaltexte[0].relevance == pytest.approx(0.8)

    def test_split_node_averages_relevance(self) -> None:
        """A node split across batches uses the mean of its relevance values."""
        node_map = {"1": _node("1", title="A", text="Part one. Part two.")}
        batch1 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r1", node_id="1", relevant_indices=[0], relevance=0.2)]
        )
        batch2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r2", node_id="1", relevant_indices=[1], relevance=0.8)]
        )
        maps = {"1": ["Part one.", "Part two."]}

        result = build_result(["1"], [batch1, batch2], [maps, maps], node_map, "doc", consensus_ratios=None)

        entry = result.originaltexte[0]
        assert entry.relevance == pytest.approx(0.5)
        assert entry.confidence == pytest.approx(0.5)

    def test_values_stay_within_range(self) -> None:
        """Every returned value lies between 0 and 1 inclusive."""
        node_map = {"1": _node("1", title="A", text="a")}
        stage2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r", node_id="1", relevant_indices=[0], relevance=1.0)]
        )
        maps = {"1": ["a"]}

        result = build_result(["1"], [stage2], [maps], node_map, "doc", consensus_ratios={"1": 1.0})

        entry = result.originaltexte[0]
        for value in (entry.consensus_ratio, entry.relevance, entry.confidence):
            assert value is not None
            assert 0.0 <= value <= 1.0


class TestCombineConfidence:
    """Tests for the pure combination helper."""

    def test_missing_ratio_returns_stage2_value(self) -> None:
        """A missing consensus ratio degrades to the Stage 2 value."""
        assert combine_confidence(None, 0.3) == pytest.approx(0.3)

    def test_missing_stage2_value_returns_ratio(self) -> None:
        """A missing Stage 2 value degrades to the consensus rate."""
        assert combine_confidence(0.75, None) == pytest.approx(0.75)

    def test_both_missing_returns_none(self) -> None:
        """Without either signal there is no confidence."""
        assert combine_confidence(None, None) is None

    def test_full_consensus_leaves_relevance_unchanged(self) -> None:
        """Agreement across every run neither raises nor lowers the Stage 2 value."""
        assert combine_confidence(1.0, 0.7) == pytest.approx(0.7)

    def test_partial_consensus_discounts_relevance(self) -> None:
        """A run that did not select the node lowers the value below the Stage 2 value."""
        assert combine_confidence(2 / 3, 0.9) == pytest.approx(0.6)

    def test_agreement_cannot_substitute_for_relevance(self) -> None:
        """A passage the prompt classes as carrying nothing stays low under full agreement."""
        assert combine_confidence(1.0, 0.1) == pytest.approx(0.1)

    def test_no_relevance_yields_no_confidence(self) -> None:
        """A worthless passage scores zero however consistently it was selected."""
        assert combine_confidence(1.0, 0.0) == pytest.approx(0.0)
