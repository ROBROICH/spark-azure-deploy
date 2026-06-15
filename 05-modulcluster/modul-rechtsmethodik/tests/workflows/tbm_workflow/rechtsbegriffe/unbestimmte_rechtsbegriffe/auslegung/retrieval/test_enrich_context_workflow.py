# ruff: noqa: PLR2004
"""Tests for EnrichContextWorkflow._construct_substrings."""

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.enrich_context_workflow import (
    EnrichContextWorkflow,
)


class TestConstructSubstrings:
    """Tests for _construct_substrings static method."""

    def test_basic_no_markers(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(paragraph_nr="44", absatz_nr="1", satz_nr="2", markers=[])
        assert result == ["§ 44", "Abs. 1", "Absatz 1", "Satz 2"]

    def test_single_digit_marker(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="3", absatz_nr="2", satz_nr="1", markers=["1"]
        )
        assert "Nr. 1" in result
        assert "Nummer 1" in result

    def test_decimal_marker(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="5", absatz_nr="1", satz_nr="1", markers=["1.2"]
        )
        assert "Nr. 1.2" in result
        assert "Nummer 1.2" in result

    def test_single_letter_marker(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="5", absatz_nr="1", satz_nr="1", markers=["a"]
        )
        assert "Buchstabe a" in result
        assert "Nr. a" not in result

    def test_uppercase_single_letter_marker(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="5", absatz_nr="1", satz_nr="1", markers=["B"]
        )
        assert "Buchstabe B" in result

    def test_double_letter_marker(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="5", absatz_nr="1", satz_nr="1", markers=["aa"]
        )
        assert "Doppelbuchstabe aa" in result
        assert "Buchstabe aa" not in result

    def test_multiple_markers_mixed(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="10", absatz_nr="3", satz_nr="1", markers=["2", "b", "cc"]
        )
        base = ["§ 10", "Abs. 3", "Absatz 3", "Satz 1"]
        assert result[:4] == base
        assert "Nr. 2" in result
        assert "Nummer 2" in result
        assert "Buchstabe b" in result
        assert "Doppelbuchstabe cc" in result

    def test_marker_with_whitespace_is_stripped(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="1", absatz_nr="1", satz_nr="1", markers=["  3  "]
        )
        assert "Nr. 3" in result

    def test_three_letter_marker_ignored(self) -> None:
        """A marker like 'abc' doesn't match any regex, so nothing extra is added."""
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="1", absatz_nr="1", satz_nr="1", markers=["abc"]
        )
        assert len(result) == 4  # only base substrings

    def test_special_char_marker_ignored(self) -> None:
        result = EnrichContextWorkflow._construct_substrings(
            paragraph_nr="1", absatz_nr="1", satz_nr="1", markers=["§"]
        )
        assert len(result) == 4
