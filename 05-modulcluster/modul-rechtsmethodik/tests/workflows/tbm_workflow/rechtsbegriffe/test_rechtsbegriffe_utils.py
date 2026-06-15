# ruff: noqa: PLR2004
"""Tests for pure functions in tbm_workflow/rechtsbegriffe/utils.py."""

import pytest

from src.activities.law_api_calls import DefinitionsByJurabkTitelOutput, LegaldefinitionOutput
from src.workflows.tbm_workflow.rechtsbegriffe.utils import (
    _format_marker,
    assign_begriffe_to_a_tbms,
    filter_rechtsbegriffe_by_assignment,
    format_legal_source,
    format_saetze,
    get_matching_legal_terms,
)

# ── format_legal_source ───────────────────────────────────────────────────────


class TestFormatLegalSource:
    def test_basic_paragraph_only(self) -> None:
        """Tests if format_legal_source returns a basic paragraph reference without absatz or satz."""
        result = format_legal_source("BNatSchG", "44", None, None, None)
        assert result == "§ 44 BNatSchG"

    def test_with_absatz(self) -> None:
        """Tests if format_legal_source includes the Absatz number when provided."""
        result = format_legal_source("BNatSchG", "44", "1", None, None)
        assert "Absatz 1" in result
        assert "§ 44" in result

    def test_with_satz_nr(self) -> None:
        """Tests if format_legal_source includes the Satz number when provided."""
        result = format_legal_source("BNatSchG", "44", "1", "2", None)
        assert "Satz 2" in result

    def test_with_markers(self) -> None:
        """Tests if format_legal_source includes the marker (Nummer) when provided."""
        result = format_legal_source("BNatSchG", "44", "1", None, ["1"])
        assert "Nummer 1" in result

    def test_jurabk_at_end(self) -> None:
        """Tests if the Jurabk abbreviation appears at the end of the formatted legal source string."""
        result = format_legal_source("BImSchG", "4", "2", "1", None)
        assert result.endswith("BImSchG")


# ── _format_marker ────────────────────────────────────────────────────────────


class TestFormatMarker:
    @pytest.mark.parametrize(
        "marker, expected",
        [
            ("1", "Nummer 1"),
            ("12", "Nummer 12"),
            ("1.1", "Nummer 1.1"),
            ("a", "Buchstabe a"),
            ("Z", "Buchstabe Z"),
            ("aa", "Doppelbuchstabe aa"),
            ("AB", "Doppelbuchstabe AB"),
        ],
    )
    def test_known_formats(self, marker: str, expected: str) -> None:
        """Tests if known marker formats are correctly formatted to their German label."""
        assert _format_marker(marker) == expected

    def test_unknown_format_returns_empty(self) -> None:
        """Tests if an unrecognized marker format returns an empty string."""
        assert _format_marker("xyz123") == ""

    def test_strips_whitespace_before_matching(self) -> None:
        """Tests if leading and trailing whitespace is stripped before matching the marker format."""
        assert _format_marker("  1  ") == "Nummer 1"


# ── format_saetze ─────────────────────────────────────────────────────────────


class TestFormatSaetze:
    def test_only_satz_nr(self) -> None:
        """Tests if format_saetze includes only the Satz number when no markers are given."""
        result = format_saetze("3", None)
        assert "Satz 3" in result

    def test_only_markers(self) -> None:
        """Tests if format_saetze includes only the formatted marker when no satz_nr is given."""
        result = format_saetze(None, ["a"])
        assert "Buchstabe a" in result

    def test_both_satz_and_markers(self) -> None:
        """Tests if format_saetze includes both Satz number and formatted markers when both are given."""
        result = format_saetze("1", ["2"])
        assert "Satz 1" in result
        assert "Nummer 2" in result

    def test_none_none_returns_empty(self) -> None:
        """Tests if format_saetze returns an empty string when both satz_nr and markers are None."""
        assert format_saetze(None, None) == ""

    def test_unknown_marker_filtered(self) -> None:
        """Tests if an unknown marker is filtered out and format_saetze returns an empty string."""
        result = format_saetze(None, ["xyz123"])
        assert result == ""


# ── assign_begriffe_to_a_tbms ─────────────────────────────────────────────────


class _Begriff:
    def __init__(self, begriff: str) -> None:
        self.begriff = begriff


class TestAssignBegriffeToATbms:
    def test_exact_match_assigns_to_correct_tbm(self) -> None:
        """Tests if a Begriff is assigned to the correct TBM when there is an exact fuzzy match."""
        tbms = ["Anlage betreiben", "Genehmigung erteilen"]
        begriffe = [_Begriff("Anlage")]
        result = assign_begriffe_to_a_tbms(tbms, begriffe, threshold=80.0)
        assert len(result) == 2
        assert begriffe[0] in result[0]
        assert begriffe[0] not in result[1]

    def test_no_match_below_threshold(self) -> None:
        """Tests if a Begriff is not assigned to any TBM when the fuzzy score is below the threshold."""
        tbms = ["Anlage betreiben"]
        begriffe = [_Begriff("Completely unrelated term xyz")]
        result = assign_begriffe_to_a_tbms(tbms, begriffe, threshold=90.0)
        assert result[0] == []

    def test_empty_begriffe_returns_empty_lists(self) -> None:
        """Tests if an empty Begriffe list results in empty assignment lists for all TBMs."""
        result = assign_begriffe_to_a_tbms(["TBM A", "TBM B"], [], threshold=80.0)
        assert result == [[], []]

    def test_output_length_matches_tbm_count(self) -> None:
        """Tests if the output list length matches the number of input TBMs."""
        tbms = ["TBM A", "TBM B", "TBM C"]
        result = assign_begriffe_to_a_tbms(tbms, [_Begriff("A")], threshold=80.0)
        assert len(result) == 3

    def test_case_insensitive_matching(self) -> None:
        """Tests if Begriff assignment is case-insensitive."""
        tbms = ["ANLAGE BETREIBEN"]
        begriffe = [_Begriff("anlage")]
        result = assign_begriffe_to_a_tbms(tbms, begriffe, threshold=80.0)
        assert begriffe[0] in result[0]


# ── filter_rechtsbegriffe_by_assignment ───────────────────────────────────────


class TestFilterRechtsbegriffeByAssignment:
    def test_returns_matching_begriffe(self) -> None:
        """Tests if only the matching Begriff is returned and non-matching ones are excluded."""
        tbms = ["Anlage betreiben"]
        begriffe = [_Begriff("Anlage"), _Begriff("xyz_irrelevant_zzz")]
        result = filter_rechtsbegriffe_by_assignment(tbms, begriffe, threshold=80.0)
        assert begriffe[0] in result
        assert begriffe[1] not in result

    def test_empty_begriffe_returns_empty(self) -> None:
        """Tests if an empty Begriffe input returns an empty filtered list."""
        result = filter_rechtsbegriffe_by_assignment(["TBM A"], [], threshold=80.0)
        assert result == []

    def test_empty_tbms_returns_empty(self) -> None:
        """Tests if an empty TBMs list returns an empty filtered Begriffe list."""
        result = filter_rechtsbegriffe_by_assignment([], [_Begriff("Anlage")], threshold=80.0)
        assert result == []

    def test_threshold_zero_matches_everything(self) -> None:
        """Tests if a threshold of 0 causes all Begriffe to be matched regardless of content."""
        tbms = ["X"]
        begriffe = [_Begriff("Anlage"), _Begriff("Genehmigung")]
        result = filter_rechtsbegriffe_by_assignment(tbms, begriffe, threshold=0.0)
        assert len(result) == 2


# ── get_matching_legal_terms ──────────────────────────────────────────────────


def _make_definitions(*begriffe: str) -> DefinitionsByJurabkTitelOutput:
    return DefinitionsByJurabkTitelOutput(
        definitions=[
            LegaldefinitionOutput(begriff=b, definition=f"Def of {b}", jurabk="BNatSchG", paragraph_nr="7")
            for b in begriffe
        ]
    )


class TestGetMatchingLegalTerms:
    def test_matches_above_threshold(self) -> None:
        """Tests if a legal term with a fuzzy score above the threshold is returned as a match."""
        defs = _make_definitions("Anlage", "Betreiber")
        result = get_matching_legal_terms(["Anlage betreiben"], defs, threshold=80.0)
        assert any(d.begriff == "Anlage" for d in result)

    def test_no_match_returns_empty(self) -> None:
        """Tests if no matches are returned when no legal term scores above the threshold."""
        defs = _make_definitions("Freiheit")
        result = get_matching_legal_terms(["Xyz irrelevant"], defs, threshold=95.0)
        assert result == set()

    def test_returns_set_not_list(self) -> None:
        """Tests if get_matching_legal_terms returns a set rather than a list."""
        defs = _make_definitions("Anlage")
        result = get_matching_legal_terms(["Anlage"], defs, threshold=80.0)
        assert isinstance(result, set)

    def test_deduplicates_matches(self) -> None:
        """Tests if the same legal term matched from multiple TBMs appears only once in the result."""
        defs = _make_definitions("Anlage")
        result = get_matching_legal_terms(["Anlage betreiben", "Anlage errichten"], defs, threshold=80.0)
        assert len(result) == 1
