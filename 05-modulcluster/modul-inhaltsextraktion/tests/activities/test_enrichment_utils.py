# tests/activities/test_enrichment_utils.py
"""Tests for shared enrichment utility functions."""

from src.activities.enrichment_utils import extract_table_text


class TestExtractTableText:
    """Tests for extract_table_text HTML-to-plain-text conversion."""

    def test_strips_html_tags(self) -> None:
        """Test that HTML tags are removed and text content is preserved."""
        html = "<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>"
        result = extract_table_text(html)
        assert "Cell 1" in result
        assert "Cell 2" in result
        assert "<" not in result

    def test_collapses_whitespace(self) -> None:
        """Test that multiple whitespace characters are collapsed to single spaces."""
        html = "<td>  Hello   World  </td>"
        result = extract_table_text(html)
        assert result == "Hello World"

    def test_truncates_at_500_chars(self) -> None:
        """Test that text longer than 500 chars is truncated with ellipsis."""
        html = "<td>" + "A" * 600 + "</td>"
        result = extract_table_text(html)
        assert len(result) == 503  # 500 + "..."
        assert result.endswith("...")
        assert result == "A" * 500 + "..."

    def test_does_not_truncate_under_500(self) -> None:
        """Test that text under 500 chars is returned without truncation."""
        html = "<td>" + "A" * 100 + "</td>"
        result = extract_table_text(html)
        assert result == "A" * 100
        assert "..." not in result

    def test_handles_empty_string(self) -> None:
        """Test that an empty string input returns an empty string."""
        result = extract_table_text("")
        assert result == ""

    def test_handles_no_tags(self) -> None:
        """Test that plain text without HTML tags is returned unchanged."""
        result = extract_table_text("plain text")
        assert result == "plain text"

    def test_handles_nested_html(self) -> None:
        """Test that nested HTML elements are properly stripped."""
        html = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>"
        result = extract_table_text(html)
        assert "Header" in result
        assert "Data" in result
