"""
Tests for prepare_stage1 and prepare_stage2 in src/pageindex_svm/preparation.py.

These test the prompt-building logic and stage2 batching with sentence maps.
"""

from temporal.contracts import (
    SucheZuordnungDocument as Document,
)
from temporal.contracts import (
    SucheZuordnungDocumentNode as DocumentNode,
)

from src.pageindex_svm.preparation import prepare_stage1, prepare_stage2

EXPECTED_NODE_MAP_COUNT = 3


def _node(node_id: str, title: str = "T", text: str = "Some text.", summary: str = "Summary.") -> DocumentNode:
    return DocumentNode(node_id=node_id, title=title, text=text, summary=summary, chunk_ids=[], page_numbers=[])


def _document(nodes: list[DocumentNode] | None = None) -> Document:
    return Document(file_id="f1", document_name="doc.pdf", nodes=nodes or [])


class TestPrepareStage1:
    """Tests for prepare_stage1 building the Stage 1 LLM prompt and node mapping."""

    def test_returns_prompt_and_node_map(self) -> None:
        doc = _document([_node("1", title="Intro", summary="Intro summary")])
        prompt, node_map, _ = prepare_stage1(
            doc, norm="§ 35 BauGB", tbm="Erschließung", research_report="Report text", max_input_tokens=100000
        )
        assert isinstance(prompt, str)
        assert isinstance(node_map, dict)
        assert "1" in node_map

    def test_prompt_contains_tbm(self) -> None:
        doc = _document([_node("1")])
        prompt, _, _ = prepare_stage1(doc, norm="§ 1", tbm="Zulässigkeit", research_report="", max_input_tokens=100000)
        assert prompt is not None
        assert "Zulässigkeit" in prompt

    def test_prompt_contains_norm(self) -> None:
        doc = _document([_node("1")])
        prompt, _, _ = prepare_stage1(doc, norm="§ 35 BauGB", tbm="TBM", research_report="", max_input_tokens=100000)
        assert prompt is not None
        assert "§ 35 BauGB" in prompt

    def test_node_map_contains_all_nodes(self) -> None:
        nodes = [_node("1"), _node("2"), _node("3")]
        doc = _document(nodes)
        _, node_map, _ = prepare_stage1(doc, norm="N", tbm="T", research_report="", max_input_tokens=100000)
        assert len(node_map) == EXPECTED_NODE_MAP_COUNT

    def test_uses_text_prefix_when_no_summary(self) -> None:
        """When summary is empty, uses first 500 chars of text as fallback."""
        doc = _document([_node("1", summary="", text="Long text content here.")])
        prompt, _, _ = prepare_stage1(doc, norm="N", tbm="T", research_report="", max_input_tokens=100000)
        assert prompt is not None
        assert "Long text content here." in prompt

    def test_research_report_truncated(self) -> None:
        """Very long research report is truncated in the prompt."""
        long_report = "Word " * 10000
        doc = _document([_node("1")])
        prompt, _, _ = prepare_stage1(doc, norm="N", tbm="T", research_report=long_report, max_input_tokens=100000)
        assert prompt is not None
        assert len(prompt) < len(long_report)


class TestPrepareStage2:
    """Tests for prepare_stage2 building per-batch prompts and sentence maps."""

    def test_returns_prompts_and_sentence_maps(self) -> None:
        node_map = {"1": _node("1", text="Sentence one. Sentence two.")}
        prompts, batch_maps = prepare_stage2(["1"], node_map, norm="N", tbm="T", research_report="")
        assert len(prompts) >= 1
        assert len(batch_maps) >= 1

    def test_empty_selected_nodes(self) -> None:
        prompts, batch_maps = prepare_stage2([], {}, norm="N", tbm="T", research_report="")
        assert prompts == []
        assert batch_maps == []

    def test_missing_node_in_map_skipped(self) -> None:
        """Nodes not in node_map are silently skipped."""
        prompts, _batch_maps = prepare_stage2(["99"], {}, norm="N", tbm="T", research_report="")
        assert prompts == []

    def test_node_with_empty_text_skipped(self) -> None:
        """Nodes with empty text are skipped."""
        node_map = {"1": _node("1", text="")}
        prompts, _batch_maps = prepare_stage2(["1"], node_map, norm="N", tbm="T", research_report="")
        assert prompts == []

    def test_prompt_contains_norm_and_tbm(self) -> None:
        node_map = {"1": _node("1", text="Text content.")}
        prompts, _ = prepare_stage2(["1"], node_map, norm="§ 35", tbm="Erschließung", research_report="")
        assert any("§ 35" in p for p in prompts)
        assert any("Erschließung" in p for p in prompts)

    def test_sentence_maps_contain_node_id(self) -> None:
        node_map = {"1": _node("1", text="Sentence one. Sentence two.")}
        _, batch_maps = prepare_stage2(["1"], node_map, norm="N", tbm="T", research_report="")
        assert any("1" in bm for bm in batch_maps)

    def test_multiple_nodes_produce_batches(self) -> None:
        """Each node gets its own batch when MAX_CHUNKS_PER_BATCH=1."""
        node_map = {
            "1": _node("1", text="First."),
            "2": _node("2", text="Second."),
        }
        prompts, batch_maps = prepare_stage2(["1", "2"], node_map, norm="N", tbm="T", research_report="")
        assert len(prompts) >= 1
        assert len(batch_maps) == len(prompts)
