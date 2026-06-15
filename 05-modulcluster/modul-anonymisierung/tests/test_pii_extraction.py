"""Tests for PII extraction helpers — prompt building and result merging."""

from src.utils.pii_extraction import (
    build_multi_page_prompt,
    merge_page_pii,
    truncate_prompt,
)


class TestTruncatePrompt:
    """Test the truncate_prompt helper."""

    def test_short_prompt_unchanged(self) -> None:
        """A short prompt should be returned unchanged."""
        assert truncate_prompt("short", 1000) == "short"

    def test_oversized_prompt_truncated(self) -> None:
        """An oversized prompt should be truncated symmetrically."""
        long = "x" * 200
        result = truncate_prompt(long, 100)
        assert len(result) < 200
        assert "truncated" in result

    def test_exact_boundary(self) -> None:
        """A prompt exactly at max_size should not be truncated."""
        prompt = "a" * 50
        result = truncate_prompt(prompt, 100)
        assert result == prompt


class TestBuildMultiPagePrompt:
    """Test the build_multi_page_prompt helper."""

    def test_single_page(self) -> None:
        """A single page should produce a valid prompt."""
        pages = [(1, ["Herr Max Mustermann wohnt in Berlin."])]
        prompt = build_multi_page_prompt(pages)
        assert "Max Mustermann" in prompt
        assert "SEITE 1" in prompt

    def test_multiple_pages(self) -> None:
        """Multiple pages should all appear with separators."""
        pages = [
            (1, ["Seite eins mit Dr. Hans Meier."]),
            (5, ["Seite fünf mit Frau Erika Muster."]),
            (10, ["Seite zehn ohne PII."]),
        ]
        prompt = build_multi_page_prompt(pages)
        assert "SEITE 1" in prompt
        assert "SEITE 5" in prompt
        assert "SEITE 10" in prompt
        assert "Hans Meier" in prompt
        assert "Erika Muster" in prompt

    def test_empty_pages_skipped(self) -> None:
        """Pages with only blank lines should be skipped."""
        pages = [
            (1, ["Herr Test Person."]),
            (2, ["", "   ", "\t"]),
            (3, ["Frau Beispiel."]),
        ]
        prompt = build_multi_page_prompt(pages)
        assert "SEITE 1" in prompt
        assert "SEITE 2" not in prompt
        assert "SEITE 3" in prompt

    def test_all_empty_pages(self) -> None:
        """All-empty pages should still produce a valid prompt (no crash)."""
        pages = [(1, [""]), (2, ["   "])]
        prompt = build_multi_page_prompt(pages)
        assert "keine" in prompt.lower() or len(prompt) > 0


class TestMergePagePii:
    """Tests for the merge_page_pii utility."""

    def test_unions_two_sources(self) -> None:
        llm = {0: ["Max"], 1: ["Berlin"]}
        presidio = {0: ["Mustermann"], 1: ["Berlin", "Hamburg"]}

        merged = merge_page_pii(llm, presidio)

        assert merged == {0: {"Max", "Mustermann"}, 1: {"Berlin", "Hamburg"}}

    def test_handles_empty_sources(self) -> None:
        """Empty source (e.g. LLM disabled) must not break the merge."""
        presidio = {0: ["Berlin"]}

        merged = merge_page_pii({}, presidio)

        assert merged == {0: {"Berlin"}}

    def test_no_sources_returns_empty(self) -> None:
        assert merge_page_pii() == {}

    def test_disjoint_pages_preserved(self) -> None:
        merged = merge_page_pii({0: ["a"]}, {1: ["b"]})
        assert merged == {0: {"a"}, 1: {"b"}}

    def test_accepts_sets_and_lists(self) -> None:
        merged = merge_page_pii({0: {"a", "b"}}, {0: ["b", "c"]})
        assert merged == {0: {"a", "b", "c"}}
