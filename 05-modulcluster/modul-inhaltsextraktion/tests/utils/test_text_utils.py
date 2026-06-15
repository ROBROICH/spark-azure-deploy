# tests/utils/test_text_utils.py
"""Tests for text utility functions in src/utils/text_utils.py."""

from src.utils.text_utils import (
    detect_hallucination_loop,
    truncate_hallucinated_content,
)


class TestDetectHallucinationLoop:
    """Tests for detect_hallucination_loop."""

    def test_short_text_not_hallucinated(self) -> None:
        """Test that short text below max_length is not flagged."""
        assert detect_hallucination_loop("Normal text", max_length=100) is False

    def test_long_text_is_hallucinated(self) -> None:
        """Test that text exceeding max_length is flagged as hallucinated."""
        text = "x" * 200
        assert detect_hallucination_loop(text, max_length=100) is True

    def test_empty_text(self) -> None:
        """Test that empty text is not flagged as hallucinated."""
        assert detect_hallucination_loop("", max_length=100) is False


class TestTruncateHallucinatedContent:
    """Tests for truncate_hallucinated_content."""

    def test_short_text_not_truncated(self) -> None:
        """Test that short text is returned unchanged."""
        assert truncate_hallucinated_content("hello", max_length=100) == "hello"

    def test_long_text_truncated(self) -> None:
        """Test that long text is truncated with an indicator message."""
        text = "x" * 200
        result = truncate_hallucinated_content(text, max_length=100)
        assert len(result) < 200
        assert "[... Content truncated" in result

    def test_empty_text(self) -> None:
        """Test that empty text is returned unchanged."""
        assert truncate_hallucinated_content("", max_length=100) == ""
