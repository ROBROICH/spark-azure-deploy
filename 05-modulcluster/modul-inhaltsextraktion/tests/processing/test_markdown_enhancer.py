# tests/processing/test_markdown_enhancer.py
"""Tests for MarkdownEnhancer page number insertion."""
from typing import Any

from src.processors.enhancer import MarkdownEnhancer
from src.providers.base import ContentItemDict


def test_insert_page_numbers_simple() -> None:
    """Tests basic page number insertion for text elements."""
    md_content = "Page 0 content.\n# Page 1 Heading\nPage 1 content."
    content_list: list[ContentItemDict] = [
        {"type": "text", "text": "Page 0 content.", "page_idx": 0},
        {"type": "text", "text": "# Page 1 Heading", "page_idx": 1},
    ]

    updated_content = MarkdownEnhancer.insert_page_numbers(md_content, content_list)

    # The function prepends page 1, then finds the anchor for page 2.
    # The assertion now checks for the correct structure including the prepended tag.
    assert updated_content.startswith('<seite nummer="1" />')
    assert '<seite nummer="2" />\n\n# Page 1 Heading' in updated_content


def test_insert_page_numbers_on_table() -> None:
    """Tests page number insertion when a page break occurs on a table."""
    md_content = "Some text.\n\n<table><tr><td>Table on page 2</td></tr></table>"
    content_list: list[ContentItemDict] = [
        {"type": "text", "text": "Some text.", "page_idx": 0},
        {
            "type": "table",
            "table_body": "<table><tr><td>Table on page 2</td></tr></table>",
            "page_idx": 1,
        },
    ]

    updated_content = MarkdownEnhancer.insert_page_numbers(md_content, content_list)

    assert '<seite nummer="2" />\n\n<table>' in updated_content


def test_insert_page_numbers_on_image() -> None:
    """Tests page number insertion when a page break occurs on an image."""
    md_content = "Some text.\n\n![alt text](images/test.png)"
    content_list: list[ContentItemDict] = [
        {"type": "text", "text": "Some text.", "page_idx": 0},
        {"type": "image", "img_path": "images/test.png", "page_idx": 1},
    ]

    updated_content = MarkdownEnhancer.insert_page_numbers(md_content, content_list)

    assert updated_content.count('<seite nummer="1" />') == 1
    assert '<seite nummer="2" />' in updated_content


def test_insert_page_numbers_no_content_list(caplog: Any) -> None:
    """Tests that a warning is logged if the content list is empty."""
    md_content = "Some content."

    updated_content = MarkdownEnhancer.insert_page_numbers(md_content, [])

    assert updated_content == md_content
    assert "Content list is empty" in caplog.text
