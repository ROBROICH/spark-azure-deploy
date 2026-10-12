# tests/activities/test_enrichment_utils.py
"""Tests for shared enrichment utility functions."""

import uuid
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.enrichment_utils import (
    build_chunks_text,
    clean_enrichment_content,
    extract_table_text,
    run_batched_enrichment,
    with_metadata,
)
from src.activities.hypothetical_questions import (
    ProcessHypotheticalQuestionsBatchInput,
    process_hypothetical_questions_batch,
)
from src.activities.schwerpunkt_extraction import (
    ProcessSchwerpunktBatchInput,
    process_schwerpunkt_batch,
)
from src.activities.species_scale_extraction import (
    ProcessSpeciesScaleBatchInput,
    process_species_scale_batch,
)
from src.schemas import Chunk, SubChunk
from src.workflows.hypothetical_questions.output_format import (
    BatchedHypotheticalQuestionsResponse,
    HypotheticalQuestionsResult,
)
from src.workflows.schwerpunkt.output_format import BatchedClassificationResponse
from src.workflows.species_scale.output_format import BatchedSpeciesAndScaleResponse, SpeciesAndScaleResult


def _make_chunk(
    page_content: str = "test content",
    metadata: dict[str, Any] | None = None,
    sub_chunks: list[SubChunk] | None = None,
) -> Chunk:
    return Chunk(
        chunk_id=uuid.uuid4(),
        page_content=page_content,
        metadata=metadata or {},
        sub_chunks=sub_chunks or [],
    )


def _make_sub_chunk(metadata: dict[str, Any] | None = None) -> SubChunk:
    return SubChunk(chunk_id=uuid.uuid4(), page_content="sub", metadata=metadata or {})


@pytest.fixture
def workflow_logger() -> Iterator[MagicMock]:
    with patch("src.activities.enrichment_utils.workflow") as mock_workflow:
        yield mock_workflow.logger


class TestExtractTableText:
    """Tests for extract_table_text HTML-to-plain-text conversion."""

    def test_strips_html_tags(self) -> None:
        """Test that HTML tags are removed and text content is preserved."""
        html = "<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>"
        result = extract_table_text(html)
        assert "Cell 1" in result
        assert "Cell 2" in result
        assert "<" not in result

    def test_collapses_whitespace(self) -> None:
        """Test that multiple whitespace characters are collapsed to single spaces."""
        html = "<td>  Hello   World  </td>"
        result = extract_table_text(html)
        assert result == "Hello World"

    def test_truncates_at_500_chars(self) -> None:
        """Test that text longer than 500 chars is truncated with ellipsis."""
        html = "<td>" + "A" * 600 + "</td>"
        result = extract_table_text(html)
        assert len(result) == 503  # 500 + "..."
        assert result.endswith("...")
        assert result == "A" * 500 + "..."

    def test_does_not_truncate_under_500(self) -> None:
        """Test that text under 500 chars is returned without truncation."""
        html = "<td>" + "A" * 100 + "</td>"
        result = extract_table_text(html)
        assert result == "A" * 100
        assert "..." not in result

    def test_handles_empty_string(self) -> None:
        """Test that an empty string input returns an empty string."""
        result = extract_table_text("")
        assert result == ""

    def test_handles_no_tags(self) -> None:
        """Test that plain text without HTML tags is returned unchanged."""
        result = extract_table_text("plain text")
        assert result == "plain text"

    def test_handles_nested_html(self) -> None:
        """Test that nested HTML elements are properly stripped."""
        html = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>"
        result = extract_table_text(html)
        assert "Header" in result
        assert "Data" in result


class TestCleanEnrichmentContentPlain:
    def test_replaces_bild_with_summary(self) -> None:
        content = '<BILD id="img1"><summary>A bird</summary><description>Long description</description></BILD>'
        assert clean_enrichment_content(content) == "A bird"

    def test_replaces_bild_without_summary_returns_empty(self) -> None:
        content = '<BILD id="img1"><description>Some description</description></BILD>'
        assert clean_enrichment_content(content) == ""

    def test_bild_with_attributes(self) -> None:
        content = '<BILD type="photo" page="3"><summary>Landscape</summary></BILD>'
        assert clean_enrichment_content(content) == "Landscape"

    def test_replaces_tabelle_with_summary(self) -> None:
        content = '<TABELLE id="t1"><summary>Revenue table</summary><raw_table><table><tr><td>100</td></tr></table></raw_table></TABELLE>'
        assert clean_enrichment_content(content) == "Revenue table"

    def test_replaces_tabelle_falls_back_to_table_text(self) -> None:
        content = '<TABELLE id="t1"><raw_table><table><tr><td>Cell value</td></tr></table></raw_table></TABELLE>'
        assert clean_enrichment_content(content) == "Cell value"

    def test_tabelle_with_blank_summary_uses_table_text(self) -> None:
        content = '<TABELLE id="1"><summary>  </summary><raw_table><table><tr><td>Rotmilan</td></tr></table></raw_table></TABELLE>'
        assert clean_enrichment_content(content) == "Rotmilan"

    def test_summary_is_stripped(self) -> None:
        content = '<BILD id="1"><summary>\n  Line 1\n  Line 2\n</summary></BILD>'
        assert clean_enrichment_content(content) == "Line 1\n  Line 2"

    def test_mixed_content_preserves_text(self) -> None:
        content = 'Before <BILD id="1"><summary>Pic</summary></BILD> after <TABELLE id="2"><summary>Tab</summary></TABELLE> end'
        assert clean_enrichment_content(content) == "Before Pic after Tab end"

    @pytest.mark.parametrize("labelled", [False, True])
    def test_no_tags_and_empty_unchanged(self, labelled: bool) -> None:
        assert clean_enrichment_content("Just plain text.", labelled=labelled) == "Just plain text."
        assert clean_enrichment_content("", labelled=labelled) == ""


class TestCleanEnrichmentContentLabelled:
    def test_bild_with_summary(self) -> None:
        content = '<BILD id="1"><summary>Sunrise view</summary></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: Sunrise view]"

    def test_bild_with_description_no_summary(self) -> None:
        content = '<BILD id="1"><description>A mountain landscape</description></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: A mountain landscape]"

    def test_bild_with_caption_no_summary_no_description(self) -> None:
        content = '<BILD id="1"><caption_text>Figure 1: Map</caption_text></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: Figure 1: Map]"

    def test_bild_fallback_no_metadata(self) -> None:
        content = '<BILD id="1"><raw_image>base64data</raw_image></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild]"

    def test_bild_summary_takes_priority_over_description(self) -> None:
        content = '<BILD id="1"><summary>Summary text</summary><description>Desc text</description></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: Summary text]"

    def test_bild_empty_summary_falls_back_to_description(self) -> None:
        content = '<BILD id="1"><summary>  </summary><description>Desc text</description></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: Desc text]"

    def test_tabelle_with_summary(self) -> None:
        content = '<TABELLE id="1"><summary>Revenue overview</summary></TABELLE>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Tabelle: Revenue overview]"

    def test_tabelle_with_caption_and_table_content(self) -> None:
        content = (
            '<TABELLE id="1">'
            "<caption_text>Table 1</caption_text>"
            "<raw_table><table><tr><td>Data</td></tr></table></raw_table>"
            "</TABELLE>"
        )
        result = clean_enrichment_content(content, labelled=True)
        assert "[Tabelle 'Table 1':" in result
        assert "Data" in result

    def test_tabelle_with_caption_no_raw_table(self) -> None:
        content = '<TABELLE id="1"><caption_text>Table 1</caption_text></TABELLE>'
        result = clean_enrichment_content(content, labelled=True)
        assert "Table 1" in result
        assert "[Tabelle" in result

    def test_tabelle_fallback_to_raw_html(self) -> None:
        content = (
            '<TABELLE id="1"><raw_table><table><tr><td>Cell A</td><td>Cell B</td></tr></table></raw_table></TABELLE>'
        )
        result = clean_enrichment_content(content, labelled=True)
        assert "[Tabelle:" in result
        assert "Cell A" in result

    def test_tabelle_fallback_no_content(self) -> None:
        content = '<TABELLE id="1"></TABELLE>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Tabelle]"

    def test_plain_text_unchanged(self) -> None:
        content = "Regular text without any tags."
        assert clean_enrichment_content(content, labelled=True) == content

    def test_empty_string(self) -> None:
        assert clean_enrichment_content("", labelled=True) == ""

    def test_multiple_elements_in_sequence(self) -> None:
        content = (
            '<BILD id="1"><summary>Photo</summary></BILD> '
            "middle text "
            '<TABELLE id="2"><summary>Data table</summary></TABELLE>'
        )
        result = clean_enrichment_content(content, labelled=True)
        assert "[Bild: Photo]" in result
        assert "middle text" in result
        assert "[Tabelle: Data table]" in result

    def test_bild_with_attributes(self) -> None:
        content = '<BILD type="photo" page="5"><summary>Attr test</summary></BILD>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Bild: Attr test]"

    def test_tabelle_with_attributes(self) -> None:
        content = '<TABELLE type="data" page="2"><summary>Attr table</summary></TABELLE>'
        result = clean_enrichment_content(content, labelled=True)
        assert result == "[Tabelle: Attr table]"


class TestBuildChunksText:
    def test_with_section_and_fallback(self) -> None:
        chunks = [
            _make_chunk('Text <BILD id="1"><summary>Pic</summary></BILD>', {"toc_path": "2.3 Planrechtfertigung"}),
            _make_chunk("Second"),
        ]
        assert build_chunks_text(chunks, heading="Textausschnitt") == (
            "--- Textausschnitt 1 ---\n"
            "**Aktueller Abschnitt:** 2.3 Planrechtfertigung\n\n"
            '**Text:** "Text Pic"\n\n'
            "--- Textausschnitt 2 ---\n"
            "**Aktueller Abschnitt:** Nicht verfügbar\n\n"
            '**Text:** "Second"'
        )

    def test_labelled_cleaning(self) -> None:
        chunks = [_make_chunk('<BILD id="1"><summary>Pic</summary></BILD>')]
        assert '**Text:** "[Bild: Pic]"' in build_chunks_text(chunks, heading="Textabschnitt", labelled=True)

    def test_without_section(self) -> None:
        chunks = [_make_chunk("A", {"toc_path": "ignored"}), _make_chunk("B")]
        assert build_chunks_text(chunks, heading="Textabschnitt", include_section=False) == (
            "--- Textabschnitt 1 ---\nA\n\n--- Textabschnitt 2 ---\nB"
        )


class TestRunBatchedEnrichment:
    async def test_splits_into_sub_batches_and_keeps_order(self) -> None:
        chunks = [_make_chunk(f"c{i}") for i in range(5)]
        calls: list[list[str]] = []

        async def invoke(batch: list[Chunk]) -> list[str]:
            calls.append([c.page_content for c in batch])
            return [c.page_content.upper() for c in batch]

        result = await run_batched_enrichment(chunks, batch_size=2, invoke=invoke, empty_result=str, label="test")

        assert result == ["C0", "C1", "C2", "C3", "C4"]
        assert sorted(calls) == [["c0", "c1"], ["c2", "c3"], ["c4"]]

    async def test_count_mismatch_falls_back_to_single_calls(self, workflow_logger: MagicMock) -> None:
        chunks = [_make_chunk("a"), _make_chunk("b"), _make_chunk("c")]
        calls: list[list[str]] = []

        async def invoke(batch: list[Chunk]) -> list[str]:
            calls.append([c.page_content for c in batch])
            if len(batch) > 1:
                return ["wrong-position"]
            if batch[0].page_content == "b":
                return []
            return [batch[0].page_content.upper()]

        result = await run_batched_enrichment(
            chunks, batch_size=3, invoke=invoke, empty_result=lambda: "-", label="test"
        )

        assert result == ["A", "-", "C"]
        assert calls == [["a", "b", "c"], ["a"], ["b"], ["c"]]
        workflow_logger.warning.assert_called_once()

    async def test_empty_chunks(self) -> None:
        invoke = AsyncMock()
        assert await run_batched_enrichment([], batch_size=5, invoke=invoke, empty_result=str, label="test") == []
        invoke.assert_not_called()


class TestWithMetadata:
    def test_copies_chunk_and_sub_chunks(self) -> None:
        sub = _make_sub_chunk({"keep": 1})
        chunk = _make_chunk("parent", {"keep": 2}, [sub])

        result = with_metadata(chunk, {"focus_topic": "X"})

        assert result.metadata == {"keep": 2, "focus_topic": "X"}
        assert result.sub_chunks[0].metadata == {"keep": 1, "focus_topic": "X"}
        assert chunk.metadata == {"keep": 2}
        assert sub.metadata == {"keep": 1}


class TestEnrichmentModulesUseSharedFallback:
    @patch("src.activities.hypothetical_questions.workflow")
    @patch("src.activities.hypothetical_questions.llm_invoke_structured", new_callable=AsyncMock)
    async def test_hypothetical_questions_unpatched_history_pads_mismatch_without_extra_calls(
        self, mock_llm: AsyncMock, hq_workflow: MagicMock
    ) -> None:
        hq_workflow.patched.return_value = False
        chunks = [_make_chunk("a"), _make_chunk("b"), _make_chunk("c")]
        mock_llm.return_value = BatchedHypotheticalQuestionsResponse(
            results=[HypotheticalQuestionsResult(questions=["QA"]), HypotheticalQuestionsResult(questions=["QB"])]
        )

        result = await process_hypothetical_questions_batch(ProcessHypotheticalQuestionsBatchInput(chunks=chunks))

        mock_llm.assert_awaited_once()
        hq_workflow.patched.assert_called_once_with("hypothetical-questions-single-chunk-fallback")
        hq_workflow.logger.warning.assert_called_once()
        assert result[0].metadata["hypothetical_questions"] == ["QA"]
        assert result[1].metadata["hypothetical_questions"] == ["QB"]
        assert "hypothetical_questions" not in result[2].metadata

    @patch("src.activities.hypothetical_questions.workflow")
    @patch("src.activities.hypothetical_questions.llm_invoke_structured", new_callable=AsyncMock)
    async def test_hypothetical_questions_unpatched_history_truncates_surplus_results(
        self, mock_llm: AsyncMock, hq_workflow: MagicMock
    ) -> None:
        hq_workflow.patched.return_value = False
        chunks = [_make_chunk("a")]
        mock_llm.return_value = BatchedHypotheticalQuestionsResponse(
            results=[HypotheticalQuestionsResult(questions=["QA"]), HypotheticalQuestionsResult(questions=["QX"])]
        )

        result = await process_hypothetical_questions_batch(ProcessHypotheticalQuestionsBatchInput(chunks=chunks))

        mock_llm.assert_awaited_once()
        assert [chunk.metadata["hypothetical_questions"] for chunk in result] == [["QA"]]

    @patch("src.activities.hypothetical_questions.workflow")
    @patch("src.activities.hypothetical_questions.llm_invoke_structured", new_callable=AsyncMock)
    async def test_hypothetical_questions_matching_count_does_not_record_patch_marker(
        self, mock_llm: AsyncMock, hq_workflow: MagicMock
    ) -> None:
        chunks = [_make_chunk("a")]
        mock_llm.return_value = BatchedHypotheticalQuestionsResponse(
            results=[HypotheticalQuestionsResult(questions=["QA"])]
        )

        await process_hypothetical_questions_batch(ProcessHypotheticalQuestionsBatchInput(chunks=chunks))

        hq_workflow.patched.assert_not_called()

    @patch("src.activities.hypothetical_questions.workflow")
    @patch("src.activities.hypothetical_questions.llm_invoke_structured", new_callable=AsyncMock)
    async def test_hypothetical_questions_patched_mismatch_does_not_shift_results(
        self, mock_llm: AsyncMock, hq_workflow: MagicMock, workflow_logger: MagicMock
    ) -> None:
        hq_workflow.patched.return_value = True
        chunks = [_make_chunk("a"), _make_chunk("b"), _make_chunk("c")]
        mock_llm.side_effect = [
            BatchedHypotheticalQuestionsResponse(
                results=[HypotheticalQuestionsResult(questions=["QA"]), HypotheticalQuestionsResult(questions=["QC"])]
            ),
            BatchedHypotheticalQuestionsResponse(results=[HypotheticalQuestionsResult(questions=["QA"])]),
            BatchedHypotheticalQuestionsResponse(results=[]),
            BatchedHypotheticalQuestionsResponse(results=[HypotheticalQuestionsResult(questions=["QC"])]),
        ]

        result = await process_hypothetical_questions_batch(ProcessHypotheticalQuestionsBatchInput(chunks=chunks))

        assert mock_llm.await_count == 1 + len(chunks)
        assert result[0].metadata["hypothetical_questions"] == ["QA"]
        assert "hypothetical_questions" not in result[1].metadata
        assert result[2].metadata["hypothetical_questions"] == ["QC"]

    @patch("src.activities.schwerpunkt_extraction.llm_invoke_structured", new_callable=AsyncMock)
    async def test_schwerpunkt_mismatch_uses_single_calls(
        self, mock_llm: AsyncMock, workflow_logger: MagicMock
    ) -> None:
        sub = _make_sub_chunk()
        chunks = [_make_chunk("a", sub_chunks=[sub]), _make_chunk("b")]
        mock_llm.side_effect = [
            BatchedClassificationResponse.model_validate(
                {"classifications": [{"topic_id": 1, "confidence": "high", "reasoning": "r"}]}
            ),
            BatchedClassificationResponse.model_validate(
                {"classifications": [{"topic_id": 1, "confidence": "high", "reasoning": "r"}]}
            ),
            BatchedClassificationResponse.model_validate({"classifications": []}),
        ]

        result = await process_schwerpunkt_batch(ProcessSchwerpunktBatchInput(chunks=chunks))

        assert mock_llm.await_count == 1 + len(chunks)
        assert result[0].metadata["focus_topic"] == "Abfallwirtschaft / Kreislaufwirtschaft"
        assert result[0].sub_chunks[0].metadata["focus_topic"] == "Abfallwirtschaft / Kreislaufwirtschaft"
        assert result[1].metadata["focus_topic"] == "Unsicher"

    @patch("src.activities.species_scale_extraction.llm_invoke_structured", new_callable=AsyncMock)
    async def test_species_scale_batch_maps_results(self, mock_llm: AsyncMock) -> None:
        chunks = [_make_chunk("a"), _make_chunk("b")]
        mock_llm.return_value = BatchedSpeciesAndScaleResponse(
            extractions=[
                SpeciesAndScaleResult(wildlife_mentioned=True, wildlife_species=["Rotmilan"]),
                SpeciesAndScaleResult(),
            ]
        )

        result = await process_species_scale_batch(ProcessSpeciesScaleBatchInput(chunks=chunks))

        mock_llm.assert_awaited_once()
        assert result[0].metadata["wildlife_species"] == ["Rotmilan"]
        assert result[1].metadata["wildlife_mentioned"] is False
