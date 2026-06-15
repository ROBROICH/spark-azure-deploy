# tests/processors/test_enhancer.py
"""Tests for the MarkdownEnhancer processor."""

import re
from typing import cast

from src.processors.enhancer import MarkdownEnhancer
from src.providers.base import ContentItemDict


class TestReplaceLatexSymbols:
    """Tests for the replace_latex_symbols method."""

    def test_replace_paragraph_symbol(self) -> None:
        """Tests replacement of paragraph symbol."""
        input_text = "See $\\S$ 123 for details."
        result = MarkdownEnhancer.replace_latex_symbols(input_text)
        assert result == "See § 123 for details."

    def test_replace_degree_symbol(self) -> None:
        """Tests replacement of degree symbol."""
        input_text = "Temperature: $45^{circ}$ C"
        result = MarkdownEnhancer.replace_latex_symbols(input_text)
        assert result == "Temperature: 45° C"

    def test_no_latex_symbols(self) -> None:
        """Tests that regular text is unchanged."""
        input_text = "This is plain text without LaTeX."
        result = MarkdownEnhancer.replace_latex_symbols(input_text)
        assert result == input_text

    def test_multiple_replacements(self) -> None:
        """Tests multiple LaTeX replacements in one string."""
        input_text = "See $\\S$ 1 at $25^{circ}$C and $\\S$ 2."
        result = MarkdownEnhancer.replace_latex_symbols(input_text)
        assert result == "See § 1 at 25°C and § 2."


class TestNormalizeImgPath:
    """Tests for the _normalize_img_path helper."""

    def test_already_bare(self) -> None:
        """Test that a bare filename is returned unchanged."""
        assert MarkdownEnhancer._normalize_img_path("file.png") == "file.png"

    def test_strips_images_prefix(self) -> None:
        """Test that the 'images/' prefix is stripped from the path."""
        assert MarkdownEnhancer._normalize_img_path("images/file.png") == "file.png"

    def test_strips_whitespace(self) -> None:
        """Test that leading and trailing whitespace is stripped."""
        assert MarkdownEnhancer._normalize_img_path("  images/file.png  ") == "file.png"

    def test_does_not_double_strip(self) -> None:
        """Test that only the first 'images/' prefix is stripped."""
        assert MarkdownEnhancer._normalize_img_path("images/images/file.png") == "images/file.png"


class TestBuildAnchorPattern:
    """Tests for the _build_anchor_pattern method."""

    def test_text_type(self) -> None:
        """Test that a text-type item produces a regex matching its trimmed text."""
        item: ContentItemDict = {"type": "text", "text": "  Hello World  ", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        assert re.search(pattern, "Hello World")
        assert re.search(pattern, "Hello  World")  # extra whitespace

    def test_title_type(self) -> None:
        """Test that a title-type item produces a regex matching its text."""
        # "title" is not part of the ContentItemDict union but is handled at runtime
        item = cast(
            ContentItemDict, {"type": "title", "text": "Section 1", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        )
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        assert re.search(pattern, "Section 1")

    def test_table_type_with_body(self) -> None:
        """Test that a table-type item with table_body produces a matching regex."""
        item: ContentItemDict = {
            "type": "table",
            "table_body": "<table><tr><td>Data</td></tr></table>",
            "img_path": "",
            "page_idx": 0,
        }
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        assert re.search(pattern, "<table><tr><td>Data</td></tr></table>")

    def test_table_type_with_img_path_only(self) -> None:
        """Test that a table-type item with only img_path produces an image regex."""
        item: ContentItemDict = {"type": "table", "img_path": "tables/table_1.png", "page_idx": 0}
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        assert re.search(pattern, "![](images/tables/table_1.png)")
        assert re.search(pattern, "![Table 1](images/tables/table_1.png)")

    def test_image_type_bare_path(self) -> None:
        """img_path without images/ prefix (bare filename)."""
        item: ContentItemDict = {
            "type": "image",
            "img_path": "image_1.png",
            "page_idx": 0,
            "bbox": [0.0, 0.0, 0.0, 0.0],
        }
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        # Matches empty alt text
        assert re.search(pattern, "![](images/image_1.png)")
        # Matches numbered alt text (Docling)
        assert re.search(pattern, "![Image 1](images/image_1.png)")
        # Matches legacy "alt text"
        assert re.search(pattern, "![alt text](images/image_1.png)")

    def test_image_type_with_images_prefix(self) -> None:
        """img_path already containing images/ prefix (real Docling data)."""
        item: ContentItemDict = {
            "type": "image",
            "img_path": "images/c8c60c48.jpg",
            "page_idx": 0,
            "bbox": [0.0, 0.0, 0.0, 0.0],
        }
        pattern = MarkdownEnhancer._build_anchor_pattern(item)
        assert pattern is not None
        # Should NOT double the prefix
        assert re.search(pattern, "![](images/c8c60c48.jpg)")
        assert not re.search(pattern, "![](images/images/c8c60c48.jpg)")

    def test_unknown_type_returns_none(self) -> None:
        """Test that an unknown content type returns None."""
        # "unknown" is not part of the ContentItemDict union but is handled at runtime
        item = cast(ContentItemDict, {"type": "unknown", "text": "test", "page_idx": 0})
        assert MarkdownEnhancer._build_anchor_pattern(item) is None

    def test_discarded_type_returns_none(self) -> None:
        """Test that a discarded content type returns None."""
        # "discarded" is not part of the ContentItemDict union but is handled at runtime
        item = cast(
            ContentItemDict, {"type": "discarded", "text": "header", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        )
        assert MarkdownEnhancer._build_anchor_pattern(item) is None

    def test_empty_text_returns_none(self) -> None:
        """Test that a text item with only whitespace returns None."""
        item: ContentItemDict = {"type": "text", "text": "   ", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        assert MarkdownEnhancer._build_anchor_pattern(item) is None

    def test_empty_img_path_returns_none(self) -> None:
        """Test that an image item with an empty path returns None."""
        item: ContentItemDict = {"type": "image", "img_path": "", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        assert MarkdownEnhancer._build_anchor_pattern(item) is None


class TestInsertPageNumbers:
    """Tests for the insert_page_numbers method."""

    def test_empty_content_list(self) -> None:
        """Tests with empty content list."""
        markdown = "# Header\nContent"
        empty_list: list[ContentItemDict] = []
        result = MarkdownEnhancer.insert_page_numbers(markdown, empty_list)
        assert result == markdown

    def test_basic_page_insertion(self) -> None:
        """Tests basic page number insertion with two pages."""
        markdown = "First page content.\n\nSecond page content."
        content_list: list[ContentItemDict] = [
            {"page_idx": 0, "type": "text", "text": "First page", "bbox": [0.0, 0.0, 0.0, 0.0]},
            {"page_idx": 1, "type": "text", "text": "Second page", "bbox": [0.0, 0.0, 0.0, 0.0]},
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert '<seite nummer="1" />' in result
        assert '<seite nummer="2" />' in result

    def test_page_one_always_added(self) -> None:
        """Tests that page 1 tag is always added at the beginning."""
        markdown = "Some content"
        content_list: list[ContentItemDict] = [
            {"page_idx": 0, "type": "text", "text": "Some", "bbox": [0.0, 0.0, 0.0, 0.0]}
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert result.startswith('<seite nummer="1" />')

    def test_page_one_not_duplicated(self) -> None:
        """Page 1 tag must appear exactly once."""
        markdown = "Content on page one.\n\nContent on page two."
        content_list: list[ContentItemDict] = [
            {"page_idx": 0, "type": "text", "text": "Content on page one.", "bbox": [0.0, 0.0, 0.0, 0.0]},
            {"page_idx": 1, "type": "text", "text": "Content on page two.", "bbox": [0.0, 0.0, 0.0, 0.0]},
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert result.count('<seite nummer="1" />') == 1

    def test_single_page_content(self) -> None:
        """Tests content list with single page."""
        markdown = "Content"
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Content", "page_idx": 0, "bbox": [0.0, 0.0, 0.0, 0.0]}
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert '<seite nummer="1" />' in result

    def test_image_with_images_prefix(self) -> None:
        """Image items whose img_path already contains images/ must match."""
        markdown = "Text.\n\n![](images/photo.jpg)\n\nMore text."
        content_list: list[ContentItemDict] = [
            {"page_idx": 0, "type": "text", "text": "Text.", "bbox": [0.0, 0.0, 0.0, 0.0]},
            {"page_idx": 1, "type": "image", "img_path": "images/photo.jpg", "bbox": [0.0, 0.0, 0.0, 0.0]},
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert '<seite nummer="2" />' in result

    def test_multiple_items_per_page_fallback(self) -> None:
        """If the first item on a page has no match, later items are tried."""
        markdown = "Visible text on page two."
        content_list: list[ContentItemDict] = [
            # page 0: nothing matchable -- "discarded" is not in ContentItemDict but handled at runtime
            cast(ContentItemDict, {"page_idx": 0, "type": "discarded", "text": "header", "bbox": [0.0, 0.0, 0.0, 0.0]}),
            # page 1: first item unmatchable image, second item is text
            {"page_idx": 1, "type": "image", "img_path": "missing.png", "bbox": [0.0, 0.0, 0.0, 0.0]},
            {"page_idx": 1, "type": "text", "text": "Visible text on page two.", "bbox": [0.0, 0.0, 0.0, 0.0]},
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert '<seite nummer="2" />' in result

    def test_heading_anchor_moves_to_line_start(self) -> None:
        """Page tag is placed before the heading line, not mid-line."""
        markdown = "Page one.\n\n# Heading on page two\nMore text."
        content_list: list[ContentItemDict] = [
            {"page_idx": 0, "type": "text", "text": "Page one.", "bbox": [0.0, 0.0, 0.0, 0.0]},
            # "title" is not in ContentItemDict but handled at runtime
            cast(
                ContentItemDict,
                {"page_idx": 1, "type": "title", "text": "Heading on page two", "bbox": [0.0, 0.0, 0.0, 0.0]},
            ),
        ]
        result = MarkdownEnhancer.insert_page_numbers(markdown, content_list)
        assert '<seite nummer="2" />\n\n# Heading on page two' in result
