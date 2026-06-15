"""
Tests for src/pageindex_svm/extraction.py — build_result pure function.
"""

from temporal.workflows.modul_suche_und_zuordnung.types import DocumentNode

from src.pageindex_svm.extraction import build_result
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
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0]),
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
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[1]),
            ]
        )
        batch2 = Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(begruendung="reason", node_id="2", relevant_indices=[0, 1]),
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
                ChunkSentenceResult(begruendung="reason", node_id="99", relevant_indices=[0]),
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
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0]),
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
                ChunkSentenceResult(begruendung="reason", node_id="1", relevant_indices=[0]),
                ChunkSentenceResult(begruendung="reason", node_id="3", relevant_indices=[0]),
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
            results=[ChunkSentenceResult(begruendung="r1", node_id="1", relevant_indices=[0])]
        )
        # Batch 2: same node "1" with sentence index 1
        batch2 = Stage2SentenceResponse(
            results=[ChunkSentenceResult(begruendung="r2", node_id="1", relevant_indices=[1])]
        )
        maps1 = {"1": ["Part one.", "Part two."]}
        maps2 = {"1": ["Part one.", "Part two."]}

        result = build_result(["1"], [batch1, batch2], [maps1, maps2], node_map, "doc1")
        assert len(result.originaltexte) == 1
        entry = result.originaltexte[0]
        assert "Part one." in entry.text
        assert "Part two." in entry.text
