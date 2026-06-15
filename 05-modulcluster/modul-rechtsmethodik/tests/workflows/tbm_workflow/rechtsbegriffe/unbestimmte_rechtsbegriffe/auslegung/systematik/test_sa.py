"""Tests for SystematikAuslegerAgentWorkflow static methods."""

from typing import Any

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.systematik.sa import (
    _AKTUELLER_ABSATZ_BEGINN,
    _AKTUELLER_ABSATZ_ENDE,
    _AKTUELLER_SATZ_BEGINN,
    _AKTUELLER_SATZ_ENDE,
    SystematikAuslegerAgentWorkflow,
)

WF = SystematikAuslegerAgentWorkflow


def _satz(satz_nr: str, markers: list[str], satz_text: str) -> dict[str, Any]:
    return {"satz_nr": satz_nr, "markers": markers, "satz_text": satz_text}


class TestBuildMarkedAbsatzBlock:
    def test_single_current_satz(self) -> None:
        absatz: dict[str, Any] = {
            "absatz_nr": "1",
            "saetze": [
                _satz("1", [], "First sentence."),
                _satz("2", [], "Second sentence."),
            ],
        }
        result = WF._build_marked_absatz_block(absatz, current_satz_nr="1", current_markers=[])
        assert _AKTUELLER_ABSATZ_BEGINN in result
        assert _AKTUELLER_ABSATZ_ENDE in result
        assert f"{_AKTUELLER_SATZ_BEGINN}First sentence.{_AKTUELLER_SATZ_ENDE}" in result
        assert "Second sentence." in result
        assert _AKTUELLER_SATZ_BEGINN not in result.split(_AKTUELLER_SATZ_ENDE)[1]

    def test_markers_must_match(self) -> None:
        absatz: dict[str, Any] = {
            "absatz_nr": "2",
            "saetze": [
                _satz("1", ["a"], "With marker a."),
                _satz("1", ["b"], "With marker b."),
            ],
        }
        result = WF._build_marked_absatz_block(absatz, current_satz_nr="1", current_markers=["b"])
        assert f"{_AKTUELLER_SATZ_BEGINN}With marker b.{_AKTUELLER_SATZ_ENDE}" in result
        # First satz should NOT be marked
        assert "With marker a." in result
        assert f"{_AKTUELLER_SATZ_BEGINN}With marker a." not in result

    def test_absatz_nr_in_output(self) -> None:
        absatz: dict[str, Any] = {
            "absatz_nr": "3",
            "saetze": [_satz("1", [], "Only.")],
        }
        result = WF._build_marked_absatz_block(absatz, current_satz_nr="1", current_markers=[])
        assert "(3)" in result


class TestBuildCurrentNormText:
    def test_current_absatz_marked_others_plain(self) -> None:
        absaetze: list[dict[str, Any]] = [
            {
                "absatz_nr": "1",
                "absatz_text": "Full text of absatz 1.",
                "saetze": [_satz("1", [], "Sentence 1.")],
            },
            {
                "absatz_nr": "2",
                "absatz_text": "Full text of absatz 2.",
                "saetze": [_satz("1", [], "Sentence 2.")],
            },
        ]
        result = WF._build_current_norm_text(
            absaetze=absaetze,
            current_absatz_nr="2",
            current_satz_nr="1",
            current_markers=[],
        )
        # Absatz 1 should be plain
        assert "(1) Full text of absatz 1." in result
        # Absatz 2 should be marked
        assert _AKTUELLER_ABSATZ_BEGINN in result
        assert _AKTUELLER_ABSATZ_ENDE in result
        assert f"{_AKTUELLER_SATZ_BEGINN}Sentence 2.{_AKTUELLER_SATZ_ENDE}" in result

    def test_single_absatz(self) -> None:
        absaetze: list[dict[str, Any]] = [
            {
                "absatz_nr": "1",
                "absatz_text": "Only absatz.",
                "saetze": [_satz("1", [], "Only sentence.")],
            },
        ]
        result = WF._build_current_norm_text(
            absaetze=absaetze, current_absatz_nr="1", current_satz_nr="1", current_markers=[]
        )
        assert _AKTUELLER_ABSATZ_BEGINN in result
        assert "(1)" not in result.split(_AKTUELLER_ABSATZ_BEGINN)[0]  # no plain absatz before

    def test_multiple_absaetze_only_one_marked(self) -> None:
        absaetze: list[dict[str, Any]] = [
            {"absatz_nr": str(i), "absatz_text": f"Text {i}.", "saetze": [_satz("1", [], f"S{i}.")]}
            for i in range(1, 5)
        ]
        result = WF._build_current_norm_text(
            absaetze=absaetze, current_absatz_nr="3", current_satz_nr="1", current_markers=[]
        )
        assert result.count(_AKTUELLER_ABSATZ_BEGINN) == 1
        assert result.count(_AKTUELLER_ABSATZ_ENDE) == 1
