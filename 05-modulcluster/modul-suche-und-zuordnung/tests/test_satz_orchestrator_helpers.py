"""
Tests for src/workflows/satz_orchestrator_helpers.py

All functions are pure (no I/O, no Temporal SDK calls) — tested directly.
"""

import pytest
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Absatz,
    AtomaresTBM,
    Auslegungsvorschlag,
    BestimmterRechtsbegriff,
    Definition,
    DefinitionSource,
    NormData,
    Rechtsbegriffe,
    Satz,
    UnbestimmterRechtsbegriff,
)

from src.satz_orchestrator_helpers import (
    _collect_rechtsbegriffe,
    _convert_bestimmt,
    _convert_unbestimmt,
    extract_satz_data,
)
from src.tbm_db_research.models import RechtsbegriffEintrag

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPECTED_DEFINITION_COUNT = 2

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _empty_rechtsbegriffe() -> Rechtsbegriffe:
    """Return a Rechtsbegriffe instance with empty bestimmte and unbestimmte lists."""
    return Rechtsbegriffe(
        bestimmte_rechtsbegriffe=[],
        unbestimmte_rechtsbegriffe=[],
    )


def _make_satz(
    satz_id: str | None = None,
    satz_nr: str = "1",
    satz_text: str = "Text.",
    tatbestandsmerkmale: list[str] | None = None,
    atomare: list[AtomaresTBM] | None = None,
) -> Satz:
    """Build a Satz fixture with configurable nr, text, Tatbestandsmerkmale, and atomare TBMs."""
    return Satz(
        id=satz_id or f"satz-{satz_nr}",
        satz_nr=satz_nr,
        satz_text=satz_text,
        tatbestandsmerkmale=tatbestandsmerkmale or [],
        atomare_tatbestandsmerkmale=atomare or [],
    )


def _make_absatz(absatz_nr: str = "1", saetze: list[Satz] | None = None) -> Absatz:
    """Build an Absatz fixture with a configurable number and list of Sätze."""
    return Absatz(absatz_nr=absatz_nr, absatz_text="", saetze=saetze or [])


def _make_norm(absaetze: list[Absatz] | None = None) -> NormData:
    """Build a NormData fixture for BauGB § 34 with configurable Absätze."""
    return NormData(
        gesetz="BauGB",
        jurabk="BauGB",
        paragraph=None,
        paragraph_nr="34",
        paragraph_titel="Zulässigkeit",
        absaetze=absaetze or [],
    )


# ---------------------------------------------------------------------------
# _convert_bestimmt
# ---------------------------------------------------------------------------


class TestConvertBestimmt:
    """Tests for _convert_bestimmt."""

    def test_typ_is_bestimmt(self) -> None:
        """Verify that the converted entry has typ set to 'bestimmt'."""
        rb = BestimmterRechtsbegriff(
            begriff="Erschließung",
            definitions=[Definition(definition="Def.", source=None)],
        )
        result = _convert_bestimmt(rb)
        assert result.typ == "bestimmt"

    def test_preserves_begriff(self) -> None:
        """Verify that the begriff name is preserved in the converted entry."""
        rb = BestimmterRechtsbegriff(begriff="Erschließung", definitions=[])
        assert _convert_bestimmt(rb).begriff == "Erschließung"

    def test_maps_definitions(self) -> None:
        """Verify that all definitions are mapped to RechtsbegriffDefinition entries."""
        rb = BestimmterRechtsbegriff(
            begriff="X",
            definitions=[
                Definition(definition="First def.", source=None),
                Definition(definition="Second def.", source=None),
            ],
        )
        result = _convert_bestimmt(rb)
        assert len(result.definitionen) == EXPECTED_DEFINITION_COUNT
        assert result.definitionen[0].text == "First def."

    def test_includes_source_when_present(self) -> None:
        """Verify that a DefinitionSource is correctly converted to a dict."""
        rb = BestimmterRechtsbegriff(
            begriff="X",
            definitions=[
                Definition(
                    definition="Def.",
                    source=DefinitionSource(jurabk="BauGB", paragraph_nr="34"),
                )
            ],
        )
        result = _convert_bestimmt(rb)
        assert result.definitionen[0].source == {"jurabk": "BauGB", "paragraph_nr": "34"}

    def test_source_none_when_absent(self) -> None:
        """Verify that source is None when the definition has no source."""
        rb = BestimmterRechtsbegriff(
            begriff="X",
            definitions=[Definition(definition="Def.", source=None)],
        )
        result = _convert_bestimmt(rb)
        assert result.definitionen[0].source is None

    def test_empty_definitions_list(self) -> None:
        """Verify that an empty definitions list produces an empty definitionen list."""
        rb = BestimmterRechtsbegriff(begriff="X", definitions=[])
        result = _convert_bestimmt(rb)
        assert result.definitionen == []


# ---------------------------------------------------------------------------
# _convert_unbestimmt
# ---------------------------------------------------------------------------


class TestConvertUnbestimmt:
    """Tests for _convert_unbestimmt."""

    def test_typ_is_unbestimmt(self) -> None:
        """Verify that the converted entry has typ set to 'unbestimmt'."""
        rb = UnbestimmterRechtsbegriff(
            begriff="öffentliches Interesse",
            auslegungsvorschlaege=[],
        )
        assert _convert_unbestimmt(rb).typ == "unbestimmt"

    def test_preserves_begriff(self) -> None:
        """Verify that the begriff name is preserved in the converted entry."""
        rb = UnbestimmterRechtsbegriff(begriff="Zumutbarkeit", auslegungsvorschlaege=[])
        assert _convert_unbestimmt(rb).begriff == "Zumutbarkeit"

    def test_maps_auslegungsvorschlaege(self) -> None:
        """Verify that Auslegungsvorschläge are mapped to a plain list of strings."""
        rb = UnbestimmterRechtsbegriff(
            begriff="X",
            auslegungsvorschlaege=[
                Auslegungsvorschlag(auslegungvorschlag="Interpretation A"),
                Auslegungsvorschlag(auslegungvorschlag="Interpretation B"),
            ],
        )
        result = _convert_unbestimmt(rb)
        assert result.auslegungsvorschlaege == ["Interpretation A", "Interpretation B"]

    def test_filters_out_dummy_text(self) -> None:
        """Verify that entries containing 'dummy text' are filtered out."""
        rb = UnbestimmterRechtsbegriff(
            begriff="X",
            auslegungsvorschlaege=[
                Auslegungsvorschlag(auslegungvorschlag="dummy text"),
                Auslegungsvorschlag(auslegungvorschlag="Real interpretation"),
            ],
        )
        result = _convert_unbestimmt(rb)
        assert result.auslegungsvorschlaege == ["Real interpretation"]

    def test_empty_auslegungsvorschlaege(self) -> None:
        """Verify that an empty Auslegungsvorschläge list produces an empty result."""
        rb = UnbestimmterRechtsbegriff(begriff="X", auslegungsvorschlaege=[])
        assert _convert_unbestimmt(rb).auslegungsvorschlaege == []


# ---------------------------------------------------------------------------
# _collect_rechtsbegriffe
# ---------------------------------------------------------------------------


class TestCollectRechtsbegriffe:
    """Tests for _collect_rechtsbegriffe."""

    def test_empty_satz_returns_empty(self) -> None:
        """Verify that a Satz with no atomare TBMs returns an empty list."""
        satz = _make_satz(atomare=[])
        assert _collect_rechtsbegriffe(satz) == []

    def test_collects_bestimmte_and_unbestimmte(self) -> None:
        """Verify that both bestimmte and unbestimmte Rechtsbegriffe are collected."""
        satz = _make_satz(
            atomare=[
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[BestimmterRechtsbegriff(begriff="A", definitions=[])],
                        unbestimmte_rechtsbegriffe=[UnbestimmterRechtsbegriff(begriff="B", auslegungsvorschlaege=[])],
                    ),
                )
            ]
        )
        result = _collect_rechtsbegriffe(satz)
        begriffe = [e.begriff for e in result]
        assert "A" in begriffe
        assert "B" in begriffe

    def test_deduplicates_by_begriff_name(self) -> None:
        """Verify that duplicate Rechtsbegriffe with the same name appear only once."""
        duplicate_rb = BestimmterRechtsbegriff(begriff="Erschließung", definitions=[])
        satz = _make_satz(
            atomare=[
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[duplicate_rb],
                        unbestimmte_rechtsbegriffe=[],
                    ),
                ),
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[duplicate_rb],
                        unbestimmte_rechtsbegriffe=[],
                    ),
                ),
            ]
        )
        result = _collect_rechtsbegriffe(satz)
        assert len(result) == 1
        assert result[0].begriff == "Erschließung"

    def test_skips_tbm_with_no_rechtsbegriffe(self) -> None:
        """Verify that atomare TBMs without Rechtsbegriffe are skipped."""
        satz = _make_satz(atomare=[AtomaresTBM(prueffrage=None, rechtsbegriffe=None)])
        assert _collect_rechtsbegriffe(satz) == []

    def test_skips_empty_begriff_name(self) -> None:
        """Verify that Rechtsbegriffe with an empty begriff name are excluded."""
        satz = _make_satz(
            atomare=[
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[BestimmterRechtsbegriff(begriff="", definitions=[])],
                        unbestimmte_rechtsbegriffe=[],
                    ),
                )
            ]
        )
        assert _collect_rechtsbegriffe(satz) == []

    def test_preserves_order_of_first_occurrence(self) -> None:
        """Verify that Rechtsbegriffe are returned in the order they first appear."""
        satz = _make_satz(
            atomare=[
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[
                            BestimmterRechtsbegriff(begriff="First", definitions=[]),
                            BestimmterRechtsbegriff(begriff="Second", definitions=[]),
                        ],
                        unbestimmte_rechtsbegriffe=[],
                    ),
                )
            ]
        )
        result = _collect_rechtsbegriffe(satz)
        assert result[0].begriff == "First"
        assert result[1].begriff == "Second"


# ---------------------------------------------------------------------------
# extract_satz_data
# ---------------------------------------------------------------------------


class TestExtractSatzData:
    """Tests for extract_satz_data."""

    def test_returns_jurabk_and_paragraph_nr(self) -> None:
        """Verify that jurabk and paragraph_nr are included in the returned dict."""
        data = _make_norm(absaetze=[_make_absatz(absatz_nr="1", saetze=[_make_satz(satz_id="satz-1", satz_nr="1")])])
        result = extract_satz_data(data, "satz-1")
        assert result["jurabk"] == "BauGB"
        assert result["paragraph_nr"] == "34"
        assert result["absatz_nr"] == "1"
        assert result["satz_nr"] == "1"

    def test_returns_satz_text(self) -> None:
        """Verify that the satz_text of the located Satz is returned."""
        data = _make_norm(
            absaetze=[
                _make_absatz(
                    absatz_nr="1",
                    saetze=[_make_satz(satz_id="satz-1", satz_nr="1", satz_text="Das Vorhaben ist zulässig.")],
                )
            ]
        )
        result = extract_satz_data(data, "satz-1")
        assert result["satz_text"] == "Das Vorhaben ist zulässig."

    def test_returns_tatbestandsmerkmale(self) -> None:
        """Verify that the Tatbestandsmerkmale list is returned correctly."""
        data = _make_norm(
            absaetze=[
                _make_absatz(
                    absatz_nr="1",
                    saetze=[_make_satz(satz_id="satz-1", satz_nr="1", tatbestandsmerkmale=["TBM1", "TBM2"])],
                )
            ]
        )
        result = extract_satz_data(data, "satz-1")
        assert result["tatbestandsmerkmale"] == ["TBM1", "TBM2"]

    def test_collects_prueffragen_from_atomare_tbms(self) -> None:
        """Verify that non-None Prüffragen from all atomare TBMs are collected."""
        satz = _make_satz(
            satz_id="satz-1",
            satz_nr="1",
            atomare=[
                AtomaresTBM(prueffrage="Frage 1?", rechtsbegriffe=None),
                AtomaresTBM(prueffrage="Frage 2?", rechtsbegriffe=None),
                AtomaresTBM(prueffrage=None, rechtsbegriffe=None),
            ],
        )
        data = _make_norm(absaetze=[_make_absatz(saetze=[satz])])
        result = extract_satz_data(data, "satz-1")
        assert result["prueffragen"] == ["Frage 1?", "Frage 2?"]

    def test_rechtsbegriffe_is_list_of_eintraege(self) -> None:
        """Verify that rechtsbegriffe in the result are RechtsbegriffEintrag instances."""
        satz = _make_satz(
            satz_id="satz-1",
            satz_nr="1",
            atomare=[
                AtomaresTBM(
                    prueffrage=None,
                    rechtsbegriffe=Rechtsbegriffe(
                        bestimmte_rechtsbegriffe=[BestimmterRechtsbegriff(begriff="Erschließung", definitions=[])],
                        unbestimmte_rechtsbegriffe=[],
                    ),
                )
            ],
        )
        data = _make_norm(absaetze=[_make_absatz(saetze=[satz])])
        result = extract_satz_data(data, "satz-1")
        assert len(result["rechtsbegriffe"]) == 1
        assert isinstance(result["rechtsbegriffe"][0], RechtsbegriffEintrag)

    def test_raises_when_satz_not_found(self) -> None:
        """Verify that a ValueError is raised when the specified Satz does not exist."""
        data = _make_norm(absaetze=[])
        with pytest.raises(ValueError):
            extract_satz_data(data, "missing")

    def test_extracts_duplicate_satz_by_id(self) -> None:
        """Verify that duplicate sentence numbers are disambiguated via satz_id."""
        data = _make_norm(
            absaetze=[
                _make_absatz(
                    saetze=[
                        _make_satz(satz_id="satz-1", satz_nr="1", satz_text="First", tatbestandsmerkmale=["TBM A"]),
                        _make_satz(satz_id="satz-2", satz_nr="1", satz_text="Second", tatbestandsmerkmale=["TBM B"]),
                    ]
                )
            ]
        )
        result = extract_satz_data(data, "satz-2")
        assert result["satz_text"] == "Second"
        assert result["tatbestandsmerkmale"] == ["TBM B"]
