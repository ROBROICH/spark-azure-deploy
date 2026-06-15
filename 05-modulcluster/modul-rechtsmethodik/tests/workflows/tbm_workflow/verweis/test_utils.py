# ruff: noqa: PLR2004
"""Tests for verweis/utils.py — pure functions and context fetching logic."""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from temporal.workflows.rechtsmethodik.types import ExplicitVerweiseInfo, Untergliederung

from src.workflows.tbm_workflow.tbm_types import VerweisWorkflowInput
from src.workflows.tbm_workflow.verweis.utils import (
    _best_law_match,
    _build_markers,
    _classify_verweis_typ,
    _extract_kontext_from_saetze,
    _fetch_verweis_context,
    _fill_missing_absatz_satz,
    _has_conflicting_sources,
    _is_empty,
    _is_sublist,
    _is_trivial_self_reference,
    _normalize,
    _parse_int_or_none,
    filter_vi_output,
    postprocess_explizite_verweise,
)
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve_data_format import Verweis, VerweisBlockExplizit

_PATCH = "src.workflows.tbm_workflow.verweis.utils"


# ── _is_empty ─────────────────────────────────────────────────────────────────


class TestIsEmpty:
    def test_none_is_empty(self) -> None:
        assert _is_empty(None) is True

    def test_empty_list_is_empty(self) -> None:
        assert _is_empty([]) is True

    def test_non_empty_list_is_not_empty(self) -> None:
        assert _is_empty(["x"]) is False

    def test_zero_is_not_empty(self) -> None:
        assert _is_empty(0) is False

    def test_empty_string_is_not_empty(self) -> None:
        assert _is_empty("") is False


# ── _has_conflicting_sources ──────────────────────────────────────────────────


class TestHasConflictingSources:
    def test_single_source_no_conflict(self) -> None:
        v = Verweis(gesetz="BGB")
        assert _has_conflicting_sources(v) is False

    def test_no_sources_no_conflict(self) -> None:
        v = Verweis()
        assert _has_conflicting_sources(v) is False

    def test_two_sources_conflict(self) -> None:
        v = Verweis(gesetz="BGB", verordnung="VO")
        assert _has_conflicting_sources(v) is True

    def test_gesetz_and_technische_norm_conflict(self) -> None:
        v = Verweis(gesetz="BGB", technische_norm="DIN 123")
        assert _has_conflicting_sources(v) is True

    def test_gesetz_with_paragraph_no_conflict(self) -> None:
        """Non-exclusive fields like paragraph_nr don't count."""
        v = Verweis(gesetz="BGB", paragraph_nr="123")
        assert _has_conflicting_sources(v) is False


# ── _is_trivial_self_reference ────────────────────────────────────────────────


class TestIsTrivialSelfReference:
    def test_all_none_is_trivial(self) -> None:
        v = Verweis()
        assert _is_trivial_self_reference(v, "BGB", "123") is True

    def test_only_same_gesetz_is_trivial(self) -> None:
        v = Verweis(gesetz="BGB")
        assert _is_trivial_self_reference(v, "BGB", "123") is True

    def test_same_gesetz_and_paragraph_is_trivial(self) -> None:
        v = Verweis(gesetz="BGB", paragraph_nr="123")
        assert _is_trivial_self_reference(v, "BGB", "123") is True

    def test_same_gesetz_different_paragraph_is_not_trivial(self) -> None:
        v = Verweis(gesetz="BGB", paragraph_nr="456")
        assert _is_trivial_self_reference(v, "BGB", "123") is False

    def test_different_gesetz_is_not_trivial(self) -> None:
        v = Verweis(gesetz="StGB")
        assert _is_trivial_self_reference(v, "BGB", "123") is False

    def test_same_gesetz_and_paragraph_with_absatz_is_not_trivial(self) -> None:
        v = Verweis(gesetz="BGB", paragraph_nr="123", absatz_nr="2")
        assert _is_trivial_self_reference(v, "BGB", "123") is False


# ── _fill_missing_absatz_satz ─────────────────────────────────────────────────


class TestFillMissingAbsatzSatz:
    @pytest.fixture
    def workflow_input(self) -> VerweisWorkflowInput:
        return VerweisWorkflowInput(
            gesetz="BGB",
            paragraph_nr="123",
            absatz_nr="2",
            satz_nr="3",
            satz_text="Ein Satz.",
            atomare_tatbestandsmerkmale=["TBM"],
            rechtsfolge="RF",
        )

    def test_fills_absatz_and_satz_when_missing(self, workflow_input: VerweisWorkflowInput) -> None:
        explizit = Verweis(gesetz="BGB", paragraph_nr="123", absatz_nr=None, satz_nr=None)
        absatz_nr, satz_nr = _fill_missing_absatz_satz(explizit, workflow_input)
        assert absatz_nr == "2"
        assert satz_nr == "3"

    def test_does_not_fill_satz_when_absatz_missing_but_satz_present(
        self, workflow_input: VerweisWorkflowInput
    ) -> None:
        explizit = Verweis(gesetz="BGB", paragraph_nr="123", absatz_nr=None, satz_nr="5")
        absatz_nr, satz_nr = _fill_missing_absatz_satz(explizit, workflow_input)
        assert absatz_nr == "2"
        assert satz_nr == "5"

    def test_does_not_fill_when_absatz_present(self, workflow_input: VerweisWorkflowInput) -> None:
        explizit = Verweis(gesetz="BGB", paragraph_nr="123", absatz_nr="4", satz_nr=None)
        absatz_nr, satz_nr = _fill_missing_absatz_satz(explizit, workflow_input)
        assert absatz_nr == "4"
        assert satz_nr is None


# ── _classify_verweis_typ ─────────────────────────────────────────────────────


class TestClassifyVerweisTyp:
    @pytest.fixture
    def workflow_input(self) -> VerweisWorkflowInput:
        return VerweisWorkflowInput(
            gesetz="BGB",
            paragraph_nr="123",
            absatz_nr="2",
            satz_nr="3",
            satz_text="Ein Satz.",
            atomare_tatbestandsmerkmale=["TBM"],
            rechtsfolge="RF",
        )

    def test_intern_when_same_gesetz_and_paragraph(self, workflow_input: VerweisWorkflowInput) -> None:
        explizit = Verweis(gesetz="BGB", paragraph_nr="123", absatz_nr=None, satz_nr=None)
        assert _classify_verweis_typ(explizit, workflow_input) == "intern"

    def test_extern_when_different_gesetz(self, workflow_input: VerweisWorkflowInput) -> None:
        explizit = Verweis(gesetz="StGB", paragraph_nr="123", absatz_nr=None, satz_nr=None)
        assert _classify_verweis_typ(explizit, workflow_input) == "extern"

    def test_extern_when_different_paragraph(self, workflow_input: VerweisWorkflowInput) -> None:
        explizit = Verweis(gesetz="BGB", paragraph_nr="456", absatz_nr=None, satz_nr=None)
        assert _classify_verweis_typ(explizit, workflow_input) == "extern"


# ── _build_markers ────────────────────────────────────────────────────────────


class TestBuildMarkers:
    def test_extracts_wert_from_list(self) -> None:
        assert _build_markers([Untergliederung(typ="Nr", wert="1"), Untergliederung(typ="Bst", wert="a")]) == ["1", "a"]

    def test_none_returns_empty(self) -> None:
        assert _build_markers(None) == []

    def test_empty_list_returns_empty(self) -> None:
        assert _build_markers([]) == []


# ── _is_sublist ───────────────────────────────────────────────────────────────


class TestIsSublist:
    def test_sublist_at_start(self) -> None:
        assert _is_sublist(["a", "b"], ["a", "b", "c"]) is True

    def test_sublist_at_end(self) -> None:
        assert _is_sublist(["b", "c"], ["a", "b", "c"]) is True

    def test_sublist_in_middle(self) -> None:
        assert _is_sublist(["b"], ["a", "b", "c"]) is True

    def test_not_sublist(self) -> None:
        assert _is_sublist(["a", "c"], ["a", "b", "c"]) is False

    def test_empty_list_returns_false(self) -> None:
        assert _is_sublist(["a"], []) is False

    def test_empty_sub_is_sublist(self) -> None:
        assert _is_sublist([], ["a", "b"]) is True


# ── _normalize ────────────────────────────────────────────────────────────────


class TestNormalize:
    def test_lowercases(self) -> None:
        assert _normalize("BGB") == "bgb"

    def test_strips_punctuation(self) -> None:
        assert _normalize("§ 123.") == "123"

    def test_collapses_whitespace(self) -> None:
        assert _normalize("a   b  c") == "a b c"

    def test_combined(self) -> None:
        assert _normalize("Bundes-Immissionsschutzgesetz (BImSchG)") == "bundes immissionsschutzgesetz bimschg"


# ── _best_law_match ───────────────────────────────────────────────────────────


class TestBestLawMatch:
    def test_exact_match(self) -> None:
        result = _best_law_match("Bundesnaturschutzgesetz", ["Bundesnaturschutzgesetz", "Bundesberggesetz"])
        assert result == "Bundesnaturschutzgesetz"

    def test_no_match_below_threshold(self) -> None:
        result = _best_law_match("Komplett anderes Wort", ["Bundesnaturschutzgesetz"], threshold=95.0)
        assert result is None

    def test_fuzzy_match_above_threshold(self) -> None:
        result = _best_law_match("Bundesnaturschutzgesetz", ["BNatSchG - Bundesnaturschutzgesetz"], threshold=80.0)
        assert result == "BNatSchG - Bundesnaturschutzgesetz"

    def test_empty_list_returns_none(self) -> None:
        result = _best_law_match("BGB", [])
        assert result is None


# ── _parse_int_or_none ────────────────────────────────────────────────────────


class TestParseIntOrNone:
    def test_digit_string(self) -> None:
        assert _parse_int_or_none("42") == 42

    def test_none_returns_none(self) -> None:
        assert _parse_int_or_none(None) is None

    def test_non_digit_returns_none(self) -> None:
        assert _parse_int_or_none("abc") is None

    def test_whitespace_digit(self) -> None:
        assert _parse_int_or_none(" 5 ") == 5

    def test_empty_string_returns_none(self) -> None:
        assert _parse_int_or_none("") is None


# ── _extract_kontext_from_saetze ──────────────────────────────────────────────


class TestExtractKontextFromSaetze:
    @pytest.fixture
    def saetze(self) -> list[dict[str, Any]]:
        return [
            {"satz_nr": 1, "satz_text": "Erster Satz.", "markers": ["1", "a"]},
            {"satz_nr": 2, "satz_text": "Zweiter Satz.", "markers": ["1", "b"]},
            {"satz_nr": 2, "satz_text": "Dritter Satz.", "markers": ["2"]},
        ]

    def test_filter_by_satz_nr_only(self, saetze: list[dict[str, Any]]) -> None:
        result = _extract_kontext_from_saetze(saetze, satz_nr=2, markers=[])
        assert result == ["Zweiter Satz.", "Dritter Satz."]

    def test_filter_by_markers_only(self, saetze: list[dict[str, Any]]) -> None:
        result = _extract_kontext_from_saetze(saetze, satz_nr=None, markers=["1", "a"])
        assert result == ["Erster Satz."]

    def test_filter_by_satz_nr_and_markers(self, saetze: list[dict[str, Any]]) -> None:
        result = _extract_kontext_from_saetze(saetze, satz_nr=1, markers=["1", "a"])
        assert result == ["Erster Satz."]

    def test_no_match_returns_empty(self, saetze: list[dict[str, Any]]) -> None:
        result = _extract_kontext_from_saetze(saetze, satz_nr=99, markers=[])
        assert result == []


# ── filter_vi_output ──────────────────────────────────────────────────────────


class TestFilterViOutput:
    def test_keeps_matching_keywords(self) -> None:
        verweise = ["allgemeine Vorschrift", "Betriebsanleitung", "keine Relevanz"]
        result = filter_vi_output(verweise)
        assert "allgemeine Vorschrift" in result
        assert "Betriebsanleitung" in result

    def test_filters_out_non_matching(self) -> None:
        verweise = ["Paragraph eins", "Absatz zwei"]
        result = filter_vi_output(verweise)
        assert result == []

    def test_case_insensitive(self) -> None:
        result = filter_vi_output(["Die VORSCHRIFT gilt"])
        assert len(result) == 1

    def test_empty_input(self) -> None:
        assert filter_vi_output([]) == []


# ── postprocess_explizite_verweise ────────────────────────────────────────────


def _make_workflow_input(**overrides: Any) -> VerweisWorkflowInput:
    base: dict[str, Any] = {
        "gesetz": "BGB",
        "paragraph_nr": "123",
        "absatz_nr": "1",
        "satz_nr": "1",
        "satz_text": "Ein Satz.",
        "atomare_tatbestandsmerkmale": ["TBM 0", "TBM 1"],
        "rechtsfolge": "RF",
    }
    base.update(overrides)
    return VerweisWorkflowInput(**base)  # pyright: ignore[reportArgumentType]


def _make_verweis_block(id: str, **verweis_fields: Any) -> VerweisBlockExplizit:
    return VerweisBlockExplizit(id=id, explizit=Verweis(**verweis_fields))


class TestPostprocessExpliziteVerweise:
    async def test_assigns_to_correct_tbm_index(self) -> None:
        """Verweis with id tbm_1 goes into the second TBM bucket."""
        blocks = [_make_verweis_block("tbm_1", gesetz="StGB", paragraph_nr="456")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ve_rf = await postprocess_explizite_verweise(blocks, wf_input)

        assert len(ve_a_tbms[0]) == 0
        assert len(ve_a_tbms[1]) == 1
        assert ve_a_tbms[1][0].gesetz == "StGB"

    async def test_assigns_rf_verweis(self) -> None:
        """Verweis with id rf_0 goes into the RF bucket."""
        blocks = [_make_verweis_block("rf_0", gesetz="StGB", paragraph_nr="456")]
        wf_input = _make_workflow_input()

        _, ve_rf = await postprocess_explizite_verweise(blocks, wf_input)

        assert len(ve_rf) == 1

    async def test_filters_conflicting_sources(self) -> None:
        """Verweis with two mutually exclusive sources is filtered out."""
        blocks = [_make_verweis_block("tbm_0", gesetz="StGB", verordnung="VO")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        assert ve_a_tbms[0] == []

    async def test_filters_trivial_self_reference(self) -> None:
        """Verweis referencing only the same gesetz+paragraph is filtered out."""
        blocks = [_make_verweis_block("tbm_0", gesetz="BGB", paragraph_nr="123")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        assert ve_a_tbms[0] == []

    async def test_skips_malformed_id(self) -> None:
        """Verweis with malformed id (not prefix_digit) is skipped."""
        blocks = [_make_verweis_block("invalid", gesetz="StGB", paragraph_nr="456")]
        wf_input = _make_workflow_input()

        ve_a_tbms, ve_rf = await postprocess_explizite_verweise(blocks, wf_input)

        assert all(lst == [] for lst in ve_a_tbms)
        assert ve_rf == []

    async def test_skips_out_of_range_index(self) -> None:
        """Verweis with index exceeding the number of TBMs is skipped."""
        blocks = [_make_verweis_block("tbm_99", gesetz="StGB", paragraph_nr="456")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        assert all(lst == [] for lst in ve_a_tbms)

    async def test_sets_verweis_typ_intern(self) -> None:
        """Verweis referencing same gesetz and paragraph with additional absatz is classified as intern."""
        blocks = [_make_verweis_block("tbm_0", gesetz="BGB", paragraph_nr="123", absatz_nr="2")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        assert ve_a_tbms[0][0].verweis_typ == "intern"

    async def test_sets_verweis_typ_extern(self) -> None:
        """Verweis referencing different paragraph is classified as extern."""
        blocks = [_make_verweis_block("tbm_0", gesetz="BGB", paragraph_nr="456")]
        wf_input = _make_workflow_input()

        ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        assert ve_a_tbms[0][0].verweis_typ == "extern"

    async def test_resolves_technische_norm(self) -> None:
        """Verweis with technische_norm gets resolved via DB lookup."""
        blocks = [_make_verweis_block("tbm_0", technische_norm="DIN 123")]
        wf_input = _make_workflow_input()

        with patch(f"{_PATCH}.tn_table_get_by_dokument", new=AsyncMock(return_value=None)):
            ve_a_tbms, _ = await postprocess_explizite_verweise(blocks, wf_input)

        tn = ve_a_tbms[0][0].technische_norm
        assert tn is not None
        assert tn.id == "DIN 123"
        assert "nicht gefunden" in tn.kurzbeschreibung


# ── _fetch_verweis_context ────────────────────────────────────────────────────


def _make_verweis_dict(**overrides: Any) -> ExplicitVerweiseInfo:
    base: dict[str, Any] = {
        "gesetz": "BGB",
        "verordnung": None,
        "paragraph_nr": "123",
        "absatz_nr": None,
        "satz_nr": None,
        "untergliederung": None,
        "anhang": None,
        "artikel": None,
        "richtlinie": None,
        "technische_norm": None,
        "verweis_typ": "extern",
    }
    return ExplicitVerweiseInfo(**{**base, **overrides})


class TestFetchVerweisContext:
    async def test_empty_fetch_norm_sets_kontext_none(self) -> None:
        """Tests if fetch_norm returning empty sets kontext to None."""
        with (
            patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value="BGB")),
            patch(f"{_PATCH}.fetch_norm", new=AsyncMock(return_value=[])),
        ):
            result = await _fetch_verweis_context(_make_verweis_dict())

        assert isinstance(result, ExplicitVerweiseInfo)
        assert result.kontext is None

    async def test_paragraph_only_returns_paragraph_text(self) -> None:
        """When no absatz/satz/markers, returns full paragraph_text."""
        with (
            patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value="BGB")),
            patch(f"{_PATCH}.fetch_norm", new=AsyncMock(return_value=[{"paragraph_text": "Der gesamte Text."}])),
        ):
            result = await _fetch_verweis_context(_make_verweis_dict())

        assert result.kontext == ["Der gesamte Text."]

    async def test_invalid_verweis_both_gesetz_and_verordnung(self) -> None:
        """Both gesetz and verordnung set → kontext is None (invalid)."""
        verweis = _make_verweis_dict(gesetz="BGB", verordnung="VO")
        result = await _fetch_verweis_context(verweis)
        assert result.kontext is None

    async def test_invalid_verweis_neither_gesetz_nor_verordnung(self) -> None:
        """Neither gesetz nor verordnung set → kontext is None (invalid)."""
        verweis = _make_verweis_dict(gesetz=None, verordnung=None)
        result = await _fetch_verweis_context(verweis)
        assert result.kontext is None

    async def test_no_paragraph_nr_sets_kontext_none(self) -> None:
        """Missing paragraph_nr → kontext is None."""
        verweis = _make_verweis_dict(paragraph_nr=None)
        result = await _fetch_verweis_context(verweis)
        assert result.kontext is None

    async def test_unresolvable_jurabk_sets_kontext_none(self) -> None:
        """If _resolve_jurabk returns None, kontext is None."""
        with patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value=None)):
            result = await _fetch_verweis_context(_make_verweis_dict())

        assert result.kontext is None

    async def test_absatz_only_returns_absatz_text(self) -> None:
        """When absatz is set but no satz/markers, returns absatz_text."""
        verweis = _make_verweis_dict(absatz_nr="2")
        with (
            patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value="BGB")),
            patch(
                f"{_PATCH}.fetch_absaetze", new=AsyncMock(return_value=[{"absatz_text": "Absatz text.", "saetze": []}])
            ),
        ):
            result = await _fetch_verweis_context(verweis)

        assert result.kontext == ["Absatz text."]

    async def test_satz_nr_extracts_specific_satz(self) -> None:
        """When satz_nr is set, filters saetze by satz_nr."""
        verweis = _make_verweis_dict(absatz_nr="1", satz_nr="2")
        empty_markers: list[str] = []
        saetze = [
            {"satz_nr": 1, "satz_text": "Erster.", "markers": empty_markers},
            {"satz_nr": 2, "satz_text": "Zweiter.", "markers": empty_markers},
        ]
        with (
            patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value="BGB")),
            patch(f"{_PATCH}.fetch_absaetze", new=AsyncMock(return_value=[{"absatz_text": "...", "saetze": saetze}])),
        ):
            result = await _fetch_verweis_context(verweis)

        assert result.kontext == ["Zweiter."]

    async def test_exception_sets_kontext_none(self) -> None:
        """If fetch raises an exception, kontext is set to None gracefully."""
        verweis = _make_verweis_dict(absatz_nr="1")
        with (
            patch(f"{_PATCH}._resolve_jurabk", new=AsyncMock(return_value="BGB")),
            patch(f"{_PATCH}.fetch_absaetze", new=AsyncMock(side_effect=RuntimeError("DB error"))),
        ):
            result = await _fetch_verweis_context(verweis)

        assert result.kontext is None
