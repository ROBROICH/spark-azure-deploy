"""
Tests for src/workflows/tbm_db_research/synthesis.py

All functions are pure (no I/O, no LLM calls) — tested directly.
"""

from typing import Any

from src.tbm_db_research.models import RechtsbegriffDefinition, RechtsbegriffEintrag
from src.tbm_db_research.synthesis import (
    _format_dke_context,
    _format_rechtsbegriffe,
    _format_urteile_context,
    build_synthesis_prompt,
)

# ---------------------------------------------------------------------------
# _format_dke_context
# ---------------------------------------------------------------------------


class TestFormatDkeContext:
    """Tests for _format_dke_context."""

    def test_empty_returns_placeholder(self) -> None:
        """Verify that an empty list returns the placeholder string."""
        result = _format_dke_context([], chars_per_chunk=500)
        assert result == "Keine Begruendungen gefunden."

    def test_single_item_with_section_title(self) -> None:
        """Verify that section_title and chunk_text appear in the output."""
        items = [{"section_title": "§ 34 Abs. 1", "chunk_text": "Textinhalt", "dokumentnummer": ""}]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "§ 34 Abs. 1" in result
        assert "Textinhalt" in result

    def test_falls_back_to_titel(self) -> None:
        """Verify that the titel field is used when section_title is absent."""
        items = [{"titel": "Fallback-Titel", "chunk_text": "Text"}]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "Fallback-Titel" in result

    def test_uses_generated_title_when_no_title(self) -> None:
        """Verify that a generated numbered title is used when no title field is present."""
        items = [{"chunk_text": "Text"}]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "Begruendung 1" in result

    def test_truncates_text_at_chars_per_chunk(self) -> None:
        """Verify that chunk text is truncated to chars_per_chunk characters."""
        long_text = "A" * 1000
        items = [{"chunk_text": long_text}]
        result = _format_dke_context(items, chars_per_chunk=100)
        # Only 100 A's should appear in the result
        assert "A" * 100 in result
        assert "A" * 101 not in result

    def test_includes_dokumentnummer(self) -> None:
        """Verify that dokumentnummer appears in the formatted output."""
        items = [{"chunk_text": "Text", "dokumentnummer": "BT-Drs. 18/1234"}]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "BT-Drs. 18/1234" in result

    def test_includes_datum_with_dokumentnummer(self) -> None:
        """Verify that datum is included in the output alongside dokumentnummer."""
        items = [{"chunk_text": "Text", "dokumentnummer": "18/1234", "datum": "2024-01-15"}]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "2024-01-15" in result

    def test_multiple_items_numbered(self) -> None:
        """Verify that multiple items are numbered sequentially in the output."""
        items = [
            {"chunk_text": "First"},
            {"chunk_text": "Second"},
        ]
        result = _format_dke_context(items, chars_per_chunk=500)
        assert "[1]" in result
        assert "[2]" in result


# ---------------------------------------------------------------------------
# _format_urteile_context
# ---------------------------------------------------------------------------


class TestFormatUrteileContext:
    """Tests for _format_urteile_context."""

    def test_empty_returns_placeholder(self) -> None:
        """Verify that an empty list returns the placeholder string."""
        result = _format_urteile_context([], max_unique_cases=5, chars_per_case=500)
        assert result == "Keine Urteile gefunden."

    def test_single_urteil(self) -> None:
        """Verify that aktenzeichen and text appear in the formatted output."""
        items = [{"aktenzeichen": "BVerwG 9 A 12/10", "text": "Urteilstext"}]
        result = _format_urteile_context(items, max_unique_cases=5, chars_per_case=500)
        assert "BVerwG 9 A 12/10" in result
        assert "Urteilstext" in result

    def test_deduplicates_by_aktenzeichen(self) -> None:
        """Verify that duplicate aktenzeichen entries are merged into a single case block."""
        items = [
            {"aktenzeichen": "BVerwG 9 A 1/10", "text": "Teil 1"},
            {"aktenzeichen": "BVerwG 9 A 1/10", "text": "Teil 2"},
        ]
        result = _format_urteile_context(items, max_unique_cases=5, chars_per_case=1000)
        # Should appear only once as a case header
        assert result.count("[1]") == 1
        # Both parts should be merged
        assert "Teil 1" in result
        assert "Teil 2" in result

    def test_respects_max_unique_cases(self) -> None:
        """Verify that only up to max_unique_cases distinct cases are included."""
        items = [{"aktenzeichen": f"Az-{i}", "text": f"Text {i}"} for i in range(10)]
        result = _format_urteile_context(items, max_unique_cases=3, chars_per_case=500)
        assert "[3]" in result
        assert "[4]" not in result

    def test_truncates_at_chars_per_case(self) -> None:
        """Verify that each case's text is truncated to chars_per_case characters."""
        long_text = "B" * 1000
        items = [{"aktenzeichen": "Az-1", "text": long_text}]
        result = _format_urteile_context(items, max_unique_cases=5, chars_per_case=200)
        assert "B" * 200 in result
        assert "B" * 201 not in result

    def test_includes_gericht_and_datum(self) -> None:
        """Verify that gericht and datum are included in the formatted output."""
        items = [{"aktenzeichen": "Az-1", "text": "T", "gericht": "BVerwG", "datum": "2020-05-01"}]
        result = _format_urteile_context(items, max_unique_cases=5, chars_per_case=500)
        assert "BVerwG" in result
        assert "2020-05-01" in result

    def test_falls_back_to_doc_id_when_no_aktenzeichen(self) -> None:
        """Verify that doc_id is used as the case identifier when aktenzeichen is absent."""
        items = [{"doc_id": "doc-xyz", "text": "Text"}]
        result = _format_urteile_context(items, max_unique_cases=5, chars_per_case=500)
        assert "doc-xyz" in result


# ---------------------------------------------------------------------------
# _format_rechtsbegriffe
# ---------------------------------------------------------------------------


class TestFormatRechtsbegriffe:
    """Tests for _format_rechtsbegriffe."""

    def test_empty_returns_placeholder(self) -> None:
        """Verify that an empty list returns the placeholder string."""
        assert _format_rechtsbegriffe([]) == "Keine Rechtsbegriffe."

    def test_bestimmt_without_source(self) -> None:
        """Verify that a bestimmter Rechtsbegriff without a source is formatted correctly."""
        rb = RechtsbegriffEintrag(
            begriff="Erschließung",
            typ="bestimmt",
            definitionen=[RechtsbegriffDefinition(text="Die Erschließung ist ...", source=None)],
        )
        result = _format_rechtsbegriffe([rb])
        assert "Erschließung" in result
        assert "bestimmter Rechtsbegriff" in result
        assert "Die Erschließung ist ..." in result

    def test_bestimmt_with_source(self) -> None:
        """Verify that source jurabk and paragraph_nr appear in the output."""
        rb = RechtsbegriffEintrag(
            begriff="Erschließung",
            typ="bestimmt",
            definitionen=[
                RechtsbegriffDefinition(
                    text="Definition.",
                    source={"jurabk": "BauGB", "paragraph_nr": "34"},
                )
            ],
        )
        result = _format_rechtsbegriffe([rb])
        assert "BauGB" in result
        assert "34" in result

    def test_unbestimmt_with_vorschlaege(self) -> None:
        """Verify that an unbestimmter Rechtsbegriff with Auslegungsvorschläge is formatted correctly."""
        rb = RechtsbegriffEintrag(
            begriff="öffentliches Interesse",
            typ="unbestimmt",
            auslegungsvorschlaege=["Interpretation A", "Interpretation B"],
        )
        result = _format_rechtsbegriffe([rb])
        assert "öffentliches Interesse" in result
        assert "unbestimmter Rechtsbegriff" in result
        assert "Interpretation A" in result

    def test_unbestimmt_without_vorschlaege(self) -> None:
        """Verify that an unbestimmter Rechtsbegriff with no Vorschläge is still included."""
        rb = RechtsbegriffEintrag(
            begriff="Zumutbarkeit",
            typ="unbestimmt",
            auslegungsvorschlaege=[],
        )
        result = _format_rechtsbegriffe([rb])
        assert "Zumutbarkeit" in result
        assert "unbestimmter Rechtsbegriff" in result

    def test_multiple_begriffe(self) -> None:
        """Verify that all entries in a list of Rechtsbegriffe appear in the output."""
        rbs = [
            RechtsbegriffEintrag(begriff="A", typ="bestimmt", definitionen=[]),
            RechtsbegriffEintrag(begriff="B", typ="unbestimmt", auslegungsvorschlaege=[]),
        ]
        result = _format_rechtsbegriffe(rbs)
        assert "A" in result
        assert "B" in result


# ---------------------------------------------------------------------------
# build_synthesis_prompt
# ---------------------------------------------------------------------------


class TestBuildSynthesisPrompt:
    """Tests for build_synthesis_prompt."""

    def _call(self, **overrides: object) -> str:
        """Build a synthesis prompt with default values, allowing selective overrides."""
        defaults: dict[str, Any] = {
            "jurabk": "BauGB",
            "paragraph_nr": "34",
            "absatz_nr": "1",
            "satz_nr": "2",
            "satz_text": "Das Vorhaben ist zulässig.",
            "tatbestandsmerkmale": ["Erschließung"],
            "prueffragen": ["Ist die Erschließung gesichert?"],
            "rechtsbegriffe": [],
            "dke_results": [],
            "ut_results": [],
        }
        defaults.update(overrides)
        return build_synthesis_prompt(**defaults)

    def test_contains_jurabk_and_paragraph(self) -> None:
        """Verify that jurabk and paragraph_nr appear in the generated prompt."""
        result = self._call()
        assert "BauGB" in result
        assert "34" in result

    def test_contains_satz_text(self) -> None:
        """Verify that the satz_text is embedded in the prompt."""
        result = self._call(satz_text="Ein besonderer Satztext.")
        assert "Ein besonderer Satztext." in result

    def test_contains_tatbestandsmerkmale(self) -> None:
        """Verify that all Tatbestandsmerkmale appear in the prompt."""
        result = self._call(tatbestandsmerkmale=["TBM Alpha", "TBM Beta"])
        assert "TBM Alpha" in result
        assert "TBM Beta" in result

    def test_contains_prueffragen(self) -> None:
        """Verify that all Prüffragen appear in the prompt."""
        result = self._call(prueffragen=["Frage eins?", "Frage zwei?"])
        assert "Frage eins?" in result
        assert "Frage zwei?" in result

    def test_returns_string(self) -> None:
        """Verify that build_synthesis_prompt returns a string."""
        assert isinstance(self._call(), str)

    def test_contains_absatz_and_satz_ref(self) -> None:
        """Verify that Absatz and Satz references are included in the prompt."""
        result = self._call(absatz_nr="3", satz_nr="1")
        assert "Absatz 3" in result
        assert "Satz 1" in result
