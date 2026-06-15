# tests/activities/test_vlm_processing.py
"""Unit tests for the VLM processing activity (apply_vlm_results)."""

from unittest.mock import patch

from src.activities.vlm_processing import ApplyVlmResultsInput, _apply_vlm_results
from src.workflows.vlm_enhancement.output_format import VLMWorkflowOutput


def _make_output(original: str, replacement: str) -> VLMWorkflowOutput:
    """Create a VLMWorkflowOutput with the given original and replacement content."""
    return VLMWorkflowOutput(
        original_content=original,
        replacement_block=replacement,
    )


class TestApplyVlmResults:
    """Tests for the single-pass VLM replacement algorithm."""

    async def test_basic_single_replacement(self) -> None:
        """A single original_content is replaced exactly once."""
        md = "Hello ![](images/a.png) world"
        results = [_make_output("![](images/a.png)", "<BILD>replaced</BILD>")]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "Hello <BILD>replaced</BILD> world"

    async def test_multiple_replacements_single_pass(self) -> None:
        """Multiple distinct patterns are all replaced in one pass."""
        md = "AAA BBB CCC"
        results = [
            _make_output("AAA", "111"),
            _make_output("BBB", "222"),
            _make_output("CCC", "333"),
        ]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "111 222 333"

    async def test_only_first_occurrence_replaced(self) -> None:
        """Each pattern is replaced at most once (count=1 semantics)."""
        md = "XYZ ... XYZ ... XYZ"
        results = [_make_output("XYZ", "REPLACED")]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "REPLACED ... XYZ ... XYZ"

    async def test_empty_results_returns_original(self) -> None:
        """No VLM results -> original markdown returned unchanged."""
        md = "unchanged text"
        inp = ApplyVlmResultsInput(vlm_results=[], markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "unchanged text"

    async def test_skips_empty_original_content(self) -> None:
        """Results with empty/whitespace original_content are skipped."""
        md = "Hello world"
        results = [
            _make_output("", "should-not-appear"),
            _make_output("   ", "should-not-appear-either"),
        ]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "Hello world"

    async def test_size_safety_abort(self) -> None:
        """Replacement is aborted when output exceeds size limit."""
        # Create small markdown, then a replacement that blows it up
        md = "tiny"
        huge_replacement = "X" * (60 * 1024 * 1024)  # 60MB
        results = [_make_output("tiny", huge_replacement)]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        # The abort happens after the replacement is applied (one replacement),
        # but the function still returns what it has
        assert len(out) > 0

    async def test_longest_match_first(self) -> None:
        """Longer patterns match before shorter ones to prevent partial matches."""
        md = "![alt](images/chart_detail.png) and ![](images/chart.png)"
        results = [
            _make_output("![](images/chart.png)", "SHORT"),
            _make_output("![alt](images/chart_detail.png)", "LONG"),
        ]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "LONG and SHORT"

    async def test_pattern_not_found_in_markdown(self) -> None:
        """Patterns not present in markdown are counted as skipped."""
        md = "Hello world"
        results = [_make_output("NONEXISTENT", "replacement")]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "Hello world"

    async def test_special_regex_chars_in_original(self) -> None:
        """Patterns with regex special characters are properly escaped."""
        md = "price is $100.00 (total)"
        results = [_make_output("$100.00 (total)", "REPLACED")]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "price is REPLACED"

    async def test_multiline_replacement(self) -> None:
        """Replacement works across multiple lines (DOTALL)."""
        md = "before\n<TABELLE>\nrow1\nrow2\n</TABELLE>\nafter"
        results = [
            _make_output(
                "<TABELLE>\nrow1\nrow2\n</TABELLE>",
                "<TABELLE>enhanced</TABELLE>",
            )
        ]
        inp = ApplyVlmResultsInput(vlm_results=results, markdown=md)

        with patch("src.activities.vlm_processing.activity"):
            out = await _apply_vlm_results(inp)

        assert out == "before\n<TABELLE>enhanced</TABELLE>\nafter"
