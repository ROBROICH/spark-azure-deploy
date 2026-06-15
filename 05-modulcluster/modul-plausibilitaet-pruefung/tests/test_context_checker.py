"""Unit tests for ContextChecker helper functions."""

from prompt_injection.prompt_defense import EXT_DATA_TAG_CLOSE, EXT_DATA_TAG_OPEN

from src.activities.context_checker import _chunk_to_text
from src.config.config import config

from .conftest import make_chunk_payload


class TestChunkToText:
    """Tests for the _chunk_to_text helper function."""

    def test_text_chunk_returns_content(self) -> None:
        """Text chunks return stripped plain text; wrapping happens at the LLM call site."""
        chunk = make_chunk_payload(
            chunk_type="text",
            chunk_content="  Hello World  ",
        )
        result = _chunk_to_text(chunk)
        assert EXT_DATA_TAG_OPEN not in result
        assert EXT_DATA_TAG_CLOSE not in result
        assert result == "Hello World"

    def test_non_text_chunk_with_summary(self) -> None:
        """Non-text chunks wrap the summary in LLM warning markers."""
        chunk = make_chunk_payload(
            chunk_type="table",
            chunk_content="<table>...</table>",
            summary="Table shows population data for 2024.",
        )
        result = _chunk_to_text(chunk)

        assert config.CONTEXT_CHECKING.LLM_SUMMARY_BEGIN_MARKER in result
        assert config.CONTEXT_CHECKING.LLM_SUMMARY_END_MARKER in result
        assert "population data" in result

    def test_non_text_chunk_without_summary(self) -> None:
        """Non-text chunks without a summary return an empty string."""
        chunk = make_chunk_payload(
            chunk_type="image",
            chunk_content="<image/>",
            summary=None,
        )
        result = _chunk_to_text(chunk)
        assert result == ""

    def test_non_text_chunk_with_empty_summary(self) -> None:
        """Non-text chunks with whitespace-only summary return empty string."""
        chunk = make_chunk_payload(
            chunk_type="table",
            chunk_content="<table/>",
            summary="   ",
        )
        result = _chunk_to_text(chunk)
        assert result == ""

    def test_text_chunk_with_special_chars(self) -> None:
        """Text chunks with special characters are handled correctly."""
        content = "Die Fläche beträgt 5.000 m² & umfasst >3 Parzellen."
        chunk = make_chunk_payload(chunk_type="text", chunk_content=content)

        result = _chunk_to_text(chunk)
        assert "5.000" in result
        assert "Parzellen" in result
