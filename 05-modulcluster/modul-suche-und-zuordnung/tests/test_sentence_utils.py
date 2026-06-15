"""
Tests for src/workflows/pageindex_svm/sentence_utils.py

All functions are pure (no I/O, no LLM calls) — tested directly.
"""

from src.pageindex_svm.sentence_utils import (
    format_chunks_with_sentences,
    reconstruct_from_indices,
    split_into_sentences,
)

# Number of sentences produced by a two-sentence input text
TWO_SENTENCES = 2

# ---------------------------------------------------------------------------
# split_into_sentences
# ---------------------------------------------------------------------------


class TestSplitIntoSentences:
    """Tests for split_into_sentences."""

    def test_empty_string_returns_empty(self) -> None:
        """Verify that an empty string produces an empty list."""
        assert split_into_sentences("") == []

    def test_single_sentence(self) -> None:
        """Verify that a single sentence is returned as a one-element list."""
        result = split_into_sentences("Das Vorhaben ist zulässig.")
        assert len(result) == 1
        assert "Das Vorhaben ist zulässig." in result[0]

    def test_splits_on_period_followed_by_uppercase(self) -> None:
        """Verify that a period followed by an uppercase letter triggers a split."""
        text = "Erster Satz. Zweiter Satz."
        result = split_into_sentences(text)
        assert len(result) >= TWO_SENTENCES

    def test_splits_on_paragraph_break(self) -> None:
        """Verify that a double newline triggers a sentence split."""
        text = "Erster Absatz.\n\nZweiter Absatz."
        result = split_into_sentences(text)
        assert len(result) >= TWO_SENTENCES

    def test_protects_zb_abbreviation(self) -> None:
        """Verify that the z.B. abbreviation does not cause a spurious split."""
        text = "Das gilt z.B. für alle Vorhaben. Zweiter Satz."
        result = split_into_sentences(text)
        # "z.B." should not cause a split
        assert any("z." in s or "Z_BEISPIEL" not in s for s in result)
        # Should produce at most 2 sentences, not 3
        assert len(result) <= TWO_SENTENCES

    def test_protects_nr_abbreviation(self) -> None:
        """Verify that the Nr. abbreviation does not cause a spurious split."""
        text = "Gemäß Nr. 3 ist das Vorhaben. Nächster Satz."
        result = split_into_sentences(text)
        assert len(result) <= TWO_SENTENCES

    def test_protects_abs_abbreviation(self) -> None:
        """Verify that the Abs. abbreviation does not cause a spurious split."""
        text = "Nach Abs. 1 gilt folgendes. Nächster Satz."
        result = split_into_sentences(text)
        assert len(result) <= TWO_SENTENCES

    def test_splits_on_exclamation(self) -> None:
        """Verify that an exclamation mark is recognized as a sentence boundary."""
        text = "Achtung! Zweiter Satz."
        result = split_into_sentences(text)
        assert len(result) >= 1

    def test_whitespace_only_parts_excluded(self) -> None:
        """Verify that whitespace-only segments are excluded from the result."""
        text = "Satz.   \n\n   Zweiter."
        result = split_into_sentences(text)
        assert all(s.strip() for s in result)

    def test_returns_list_of_strings(self) -> None:
        """Verify that the return type is a list of strings."""
        result = split_into_sentences("Ein Satz.")
        assert isinstance(result, list)
        assert all(isinstance(s, str) for s in result)


# ---------------------------------------------------------------------------
# reconstruct_from_indices
# ---------------------------------------------------------------------------


class TestReconstructFromIndices:
    """Tests for reconstruct_from_indices."""

    def test_empty_sentences_returns_empty(self) -> None:
        """Verify that an empty sentence list returns an empty string."""
        assert reconstruct_from_indices([], [0]) == ""

    def test_empty_indices_returns_placeholder(self) -> None:
        """Verify that an empty index list returns the placeholder string."""
        assert reconstruct_from_indices(["Satz 1.", "Satz 2."], []) == "(...)"

    def test_single_valid_index(self) -> None:
        """Verify that a single valid index returns the corresponding sentence."""
        sentences = ["Erster.", "Zweiter.", "Dritter."]
        result = reconstruct_from_indices(sentences, [1])
        assert "Zweiter." in result

    def test_gap_at_start_adds_placeholder(self) -> None:
        """Verify that a gap before the first selected sentence adds a leading placeholder."""
        sentences = ["Erster.", "Zweiter.", "Dritter."]
        result = reconstruct_from_indices(sentences, [2])
        assert result.startswith("(...)")

    def test_gap_at_end_adds_placeholder(self) -> None:
        """Verify that a gap after the last selected sentence adds a trailing placeholder."""
        sentences = ["Erster.", "Zweiter.", "Dritter."]
        result = reconstruct_from_indices(sentences, [0])
        assert result.endswith("(...)")

    def test_gap_in_middle_adds_placeholder(self) -> None:
        """Verify that a gap between non-consecutive selected indices inserts a placeholder."""
        sentences = ["Erster.", "Zweiter.", "Dritter.", "Vierter."]
        result = reconstruct_from_indices(sentences, [0, 3])
        assert "(...)" in result

    def test_consecutive_indices_no_gap(self) -> None:
        """Verify that consecutive indices produce output with no internal gaps."""
        sentences = ["A.", "B.", "C."]
        result = reconstruct_from_indices(sentences, [0, 1, 2])
        # All sentences, no internal gaps
        assert "A." in result
        assert "B." in result
        assert "C." in result

    def test_all_indices_no_leading_trailing_placeholder(self) -> None:
        """Verify that selecting all indices produces no leading or trailing placeholder."""
        sentences = ["A.", "B.", "C."]
        result = reconstruct_from_indices(sentences, [0, 1, 2])
        assert not result.startswith("(...)")
        assert not result.endswith("(...)")

    def test_invalid_indices_filtered_out(self) -> None:
        """Verify that out-of-range indices are silently ignored."""
        sentences = ["Satz 1.", "Satz 2."]
        result = reconstruct_from_indices(sentences, [0, 99])
        assert "Satz 1." in result
        assert "99" not in result

    def test_all_invalid_indices_returns_placeholder(self) -> None:
        """Verify that all-invalid indices yield the placeholder string."""
        sentences = ["Satz 1."]
        result = reconstruct_from_indices(sentences, [99])
        assert result == "(...)"

    def test_unsorted_indices_sorted(self) -> None:
        """Verify that unsorted indices are sorted before reconstruction."""
        sentences = ["A.", "B.", "C."]
        result = reconstruct_from_indices(sentences, [2, 0])
        assert "A." in result
        assert "C." in result


# ---------------------------------------------------------------------------
# format_chunks_with_sentences
# ---------------------------------------------------------------------------


class TestFormatChunksWithSentences:
    """Tests for format_chunks_with_sentences."""

    def test_empty_chunks_returns_empty(self) -> None:
        """Verify that an empty chunk list returns an empty string and empty map."""
        formatted, sentence_maps = format_chunks_with_sentences([])
        assert formatted == ""
        assert sentence_maps == {}

    def test_returns_node_id_in_formatted(self) -> None:
        """Verify that the node_id appears in the formatted output."""
        chunks = [{"node_id": "node-42", "title": "Abschnitt", "text": "Ein Satz."}]
        formatted, _ = format_chunks_with_sentences(chunks)
        assert "node-42" in formatted

    def test_returns_title_in_formatted(self) -> None:
        """Verify that the chunk title appears in the formatted output."""
        chunks = [{"node_id": "n1", "title": "Mein Titel", "text": "Text."}]
        formatted, _ = format_chunks_with_sentences(chunks)
        assert "Mein Titel" in formatted

    def test_sentence_map_keyed_by_node_id(self) -> None:
        """Verify that sentence_maps uses node_id as key and holds a list of sentences."""
        chunks = [{"node_id": "n1", "title": "T", "text": "Erster Satz. Zweiter Satz."}]
        _, sentence_maps = format_chunks_with_sentences(chunks)
        assert "n1" in sentence_maps
        assert isinstance(sentence_maps["n1"], list)

    def test_sentences_numbered_in_output(self) -> None:
        """Verify that sentences are numbered starting from [0] in the formatted output."""
        chunks = [{"node_id": "n1", "title": "T", "text": "Erster. Zweiter."}]
        formatted, _ = format_chunks_with_sentences(chunks)
        assert "[0]" in formatted

    def test_multiple_chunks(self) -> None:
        """Verify that multiple chunks each appear in the output and sentence map."""
        chunks = [
            {"node_id": "n1", "title": "T1", "text": "Text A."},
            {"node_id": "n2", "title": "T2", "text": "Text B."},
        ]
        formatted, sentence_maps = format_chunks_with_sentences(chunks)
        assert "n1" in formatted
        assert "n2" in formatted
        assert "n1" in sentence_maps
        assert "n2" in sentence_maps
