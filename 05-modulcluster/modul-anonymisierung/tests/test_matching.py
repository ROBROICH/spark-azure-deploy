"""Tests for the PII matching services."""

from src.services.pii_matcher import fuzzy_search_pdf


class TestFuzzySearch:
    """Test fuzzy matching against page text."""

    def test_exact_match(self) -> None:
        """Exact terms should always match."""
        text = "Der Geschäftsführer Max Mustermann hat unterschrieben."
        terms = ["Max Mustermann"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Max Mustermann" in matches

    def test_short_terms_skipped(self) -> None:
        """Terms with 2 or fewer characters should be skipped."""
        text = "Dr Max Mustermann"
        terms = ["Dr"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert len(matches) == 0

    def test_no_match_below_threshold(self) -> None:
        """Dissimilar terms should not match at high threshold."""
        text = "Hier steht etwas ganz anderes."
        terms = ["Max Mustermann"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.95)
        assert len(matches) == 0

    def test_no_substring_match_within_word(self) -> None:
        """Terms that appear as substrings within larger words should NOT match."""
        text = "Die Kernenergie wird weiterhin diskutiert."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert len(matches) == 0

    def test_no_substring_match_suffix(self) -> None:
        """Terms at the end of a word should NOT match."""
        text = "Der Niedergang war unvermeidlich."
        terms = ["Eder"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert len(matches) == 0

    def test_no_substring_match_prefix(self) -> None:
        """Terms at the beginning of a word should NOT match."""
        text = "Die Bergrettung war erfolgreich."
        terms = ["Berg"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert len(matches) == 0

    def test_match_at_word_boundary(self) -> None:
        """Terms that are full words should still match."""
        text = "Herr Kern hat den Vertrag unterschrieben."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches

    def test_match_at_punctuation_boundary(self) -> None:
        """Terms followed or preceded by punctuation should match."""
        text = "Unterzeichnet von Kern, dem Geschäftsführer."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches

    def test_match_at_start_of_text(self) -> None:
        """Terms at the very start of text should match."""
        text = "Kern ist verantwortlich."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches

    def test_match_at_end_of_text(self) -> None:
        """Terms at the very end of text should match."""
        text = "Verantwortlich ist Kern"
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches

    def test_no_fuzzy_substring_within_word(self) -> None:
        """Fuzzy matches within larger words should not match."""
        text = "Die Johannskirche steht am Marktplatz."
        terms = ["Johann"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert len(matches) == 0

    def test_match_with_hyphen_boundary(self) -> None:
        """Terms separated by hyphens should match."""
        text = "Der Kern-Bereich wurde gesichert."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches

    def test_match_when_first_occurrence_is_substring(self) -> None:
        """Should find standalone word even when first occurrence is inside another word."""
        text = "Die Kernenergie ist wichtig. Herr Kern hat unterschrieben."
        terms = ["Kern"]
        matches = fuzzy_search_pdf(text, terms, threshold=0.9)
        assert "Kern" in matches
