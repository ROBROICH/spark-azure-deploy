# tests/providers/test_docling_provider.py
"""
Tests for DoclingProvider, specifically table image cropping functionality.
"""

from typing import Any

from src.providers.docling.table_extractor import TableExtractor
from src.providers.docling.transforms import sanitize_output_prefix


class TestDoclingProviderBuildTableHtml:
    """Tests for HTML table generation from docling JSON."""

    def test_build_table_html_simple(self) -> None:
        """Test HTML generation for a simple table."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 2,
                "table_cells": [
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "A1"},
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 1, "text": "A2"},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "text": "B1"},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 1, "text": "B2"},
                ],
            }
        }

        html = TableExtractor.build_html(table)

        assert "<table>" in html
        assert "</table>" in html
        assert "<td>A1</td>" in html
        assert "<td>B2</td>" in html

    def test_build_table_html_with_headers(self) -> None:
        """Test HTML generation with header cells."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 2,
                "table_cells": [
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "Header1", "column_header": True},
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 1, "text": "Header2", "column_header": True},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "text": "Data1"},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 1, "text": "Data2"},
                ],
            }
        }

        html = TableExtractor.build_html(table)

        assert "<th>Header1</th>" in html
        assert "<th>Header2</th>" in html
        assert "<td>Data1</td>" in html

    def test_build_table_html_with_rowspan(self) -> None:
        """Test HTML generation with row spans."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 2,
                "table_cells": [
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "Merged", "row_span": 2},
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 1, "text": "A2"},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 1, "text": "B2"},
                ],
            }
        }

        html = TableExtractor.build_html(table)

        assert 'rowspan="2"' in html
        assert "<td>Merged</td>" not in html  # Should have rowspan attribute
        assert '<td rowspan="2">Merged</td>' in html

    def test_build_table_html_escapes_special_chars(self) -> None:
        """Test that special HTML characters are escaped."""
        table = {
            "data": {
                "num_rows": 1,
                "num_cols": 1,
                "table_cells": [
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "A & B < C > D"},
                ],
            }
        }

        html = TableExtractor.build_html(table)

        assert "&amp;" in html
        assert "&lt;" in html
        assert "&gt;" in html
        assert "A & B" not in html  # Raw & should not appear

    def test_build_table_html_empty_table(self) -> None:
        """Test HTML generation for empty table."""
        table: dict[str, Any] = {"data": {"num_rows": 0, "num_cols": 0, "table_cells": list[dict[str, Any]]()}}

        html = TableExtractor.build_html(table)

        assert html == "<table></table>"


class TestDoclingProviderSanitizeOutputPrefix:
    """Tests for output prefix sanitization."""

    def test_sanitize_normal_prefix(self) -> None:
        """Test that normal prefixes are unchanged."""
        prefix = "A1-3_ETL 182. Übersichtsplan"
        result = sanitize_output_prefix(prefix)
        assert result == prefix

    def test_sanitize_removes_newlines(self) -> None:
        """Test that newlines are removed."""
        prefix = "Document\nWith\nNewlines"
        result = sanitize_output_prefix(prefix)
        assert "\n" not in result
        # Newlines are control characters (Cc) so they get filtered out
        assert result == "DocumentWithNewlines"

    def test_sanitize_removes_carriage_returns(self) -> None:
        """Test that carriage returns are replaced."""
        prefix = "Document\r\nWith\rReturns"
        result = sanitize_output_prefix(prefix)
        assert "\r" not in result
        assert "\n" not in result

    def test_sanitize_removes_control_characters(self) -> None:
        """Test that control characters are removed."""
        # Soft hyphen (U+00AD) - invisible character that can cause issues
        prefix = "A1\u00ad3_ETL"
        result = sanitize_output_prefix(prefix)
        assert "\u00ad" not in result

    def test_sanitize_removes_zero_width_chars(self) -> None:
        """Test that zero-width characters are removed."""
        # Zero-width space (U+200B) and zero-width non-joiner (U+200C)
        prefix = "A1\u200b3_\u200cETL"
        result = sanitize_output_prefix(prefix)
        assert "\u200b" not in result
        assert "\u200c" not in result

    def test_sanitize_removes_problematic_filename_chars(self) -> None:
        """Test that chars invalid in filenames are replaced."""
        prefix = 'File<Name>With:Bad"Chars|?*'
        result = sanitize_output_prefix(prefix)
        for char in ["<", ">", ":", '"', "|", "?", "*"]:
            assert char not in result

    def test_sanitize_preserves_spaces_and_tabs(self) -> None:
        """Test that regular spaces and tabs are preserved."""
        prefix = "Document With\tTabs"
        result = sanitize_output_prefix(prefix)
        assert " " in result
        assert "\t" in result

    def test_sanitize_removes_line_separator(self) -> None:
        """Test that Unicode LINE SEPARATOR (U+2028) is removed.

        This character causes newlines when JSON-serialized, corrupting filenames.
        """
        # U+2028 LINE SEPARATOR - category Zl
        prefix = "A1\u20283_ETL\u2028182"
        result = sanitize_output_prefix(prefix)
        assert "\u2028" not in result
        # Should either remove or replace with underscore
        assert "A1" in result or "A1_" in result

    def test_sanitize_removes_paragraph_separator(self) -> None:
        """Test that Unicode PARAGRAPH SEPARATOR (U+2029) is removed.

        This character causes newlines when JSON-serialized, corrupting filenames.
        """
        # U+2029 PARAGRAPH SEPARATOR - category Zp
        prefix = "Document\u2029With\u2029Paragraphs"
        result = sanitize_output_prefix(prefix)
        assert "\u2029" not in result

    def test_sanitize_handles_mixed_problematic_chars(self) -> None:
        """Test sanitization with multiple types of problematic characters."""
        # Mix of: soft hyphen, zero-width space, line separator, newline
        prefix = "A\u00ad1-\u200b3_\u2028ETL\n182"
        result = sanitize_output_prefix(prefix)
        # All problematic chars should be removed
        assert "\u00ad" not in result
        assert "\u200b" not in result
        assert "\u2028" not in result
        assert "\n" not in result
        # Should still contain the visible parts
        assert "A" in result
        assert "3" in result
        assert "ETL" in result
        assert "182" in result
