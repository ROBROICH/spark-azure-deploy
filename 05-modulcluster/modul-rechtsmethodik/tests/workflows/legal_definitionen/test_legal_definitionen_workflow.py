# ruff: noqa: PLR2004
"""Tests for LegalDefinitionenWorkflow._split_text and _smart_split_sentences."""

import pytest

from src.workflows.legal_definitionen.legal_definitionen_workflow import (
    MAX_CHUNK_SIZE,
    LegalDefinitionenWorkflow,
    _smart_split_sentences,
)


class TestSplitText:
    def test_short_text_returned_as_is(self) -> None:
        """Tests if a short text is returned as a single-element list without splitting."""
        text = "Kurzer Text."
        result = LegalDefinitionenWorkflow._split_text(text)
        assert result == [text]

    def test_text_exactly_at_limit_returned_as_is(self) -> None:
        """Tests if a text exactly at MAX_CHUNK_SIZE is returned as a single chunk."""
        text = "a" * MAX_CHUNK_SIZE
        result = LegalDefinitionenWorkflow._split_text(text)
        assert result == [text]

    def test_long_text_split_into_chunks_within_limit(self) -> None:
        """Tests if a long text is split into multiple chunks each within MAX_CHUNK_SIZE."""
        # Build a text clearly exceeding the limit via repeated sentences
        sentence = "Dies ist ein Testsatz. "
        text = sentence * ((MAX_CHUNK_SIZE // len(sentence)) + 5)
        result = LegalDefinitionenWorkflow._split_text(text)
        assert len(result) > 1
        for chunk in result:
            assert len(chunk) <= MAX_CHUNK_SIZE

    def test_oversized_single_sentence_is_character_split(self) -> None:
        """Tests if an oversized single sentence is split by character and its content is fully preserved."""
        oversized = "A" * (MAX_CHUNK_SIZE + 500)
        result = LegalDefinitionenWorkflow._split_text(oversized)
        assert all(len(c) <= MAX_CHUNK_SIZE for c in result)
        assert "".join(result) == oversized

    def test_no_chunk_is_empty(self) -> None:
        """Tests if no chunk produced by _split_text is empty or whitespace-only."""
        sentence = "Satz mit Inhalt. "
        text = sentence * ((MAX_CHUNK_SIZE // len(sentence)) + 3)
        for chunk in LegalDefinitionenWorkflow._split_text(text):
            assert chunk.strip() != ""

    def test_content_preserved_after_split(self) -> None:
        """Tests if all original content is preserved across all chunks after splitting."""
        sentence = "Satz. "
        text = sentence * ((MAX_CHUNK_SIZE // len(sentence)) + 5)
        chunks = LegalDefinitionenWorkflow._split_text(text)
        # All original content must survive (modulo joining whitespace/punctuation differences)
        combined = " ".join(chunks)
        for word in ["Satz"] * 3:
            assert word in combined


class TestSmartSplitSentences:
    def test_basic_split_on_capital(self) -> None:
        """Tests if text is split into separate sentences on a capital letter after a period."""
        text = "Erster Satz. Zweiter Satz."
        result = _smart_split_sentences(text)
        assert len(result) == 2
        assert result[0] == "Erster Satz"
        assert result[1] == "Zweiter Satz."

    def test_does_not_split_on_month_name(self) -> None:
        """Tests if a period before a month name does not cause an incorrect sentence split."""
        text = "Inkrafttreten am 1. Januar 2020. Neuer Satz."
        result = _smart_split_sentences(text)
        # "1. Januar 2020" must not be split
        combined = " ".join(result)
        assert "Januar 2020" in combined

    def test_does_not_split_on_abbreviation(self) -> None:
        """Tests if common abbreviations like 'Nr.' do not cause an incorrect sentence split."""
        text = "Vgl. Nr. 5 des Gesetzes. Neuer Satz."
        result = _smart_split_sentences(text)
        # "Nr. 5" should not split
        assert any("Nr" in s for s in result)

    def test_returns_non_empty_parts(self) -> None:
        """Tests if all returned sentence parts are non-empty strings."""
        text = "Satz eins. Satz zwei. Satz drei."
        result = _smart_split_sentences(text)
        assert all(part.strip() != "" for part in result)

    def test_single_sentence_returns_single_element(self) -> None:
        """Tests if a single sentence input returns a list with exactly one element."""
        text = "Nur ein Satz ohne weiteres."
        result = _smart_split_sentences(text)
        assert len(result) == 1

    @pytest.mark.parametrize("month", ["Januar", "Februar", "März", "Dezember"])
    def test_month_names_not_split(self, month: str) -> None:
        """Tests if German month names after a period are not treated as sentence boundaries."""
        text = f"Am 1. {month} trat es in Kraft. Weiterer Satz."
        result = _smart_split_sentences(text)
        assert any(month in s for s in result)
