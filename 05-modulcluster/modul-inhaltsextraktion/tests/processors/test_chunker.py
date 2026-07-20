"""Tests for the MarkdownChunker and related chunking utilities."""
from unittest.mock import patch

from src.processors.text_splitters import Document

from src.config import Config
from src.processors.chunker import MarkdownChunker
from src.processors.page_tracker import extract_page_numbers
from src.processors.sub_chunk_builder import is_table_fragment
from src.processors.toc_builder import (
    build_toc_from_content_list,
    get_all_descendants,
    get_clean_header,
    get_header_level_and_title,
)
from src.providers.base import ContentItemDict


def test_extract_page_numbers_single_page() -> None:
    """Test _extract_page_numbers with a single page tag."""
    text = """Content <seite nummer="10" /> more content"""
    assert extract_page_numbers(text) == [10]


def test_extract_page_numbers_multiple_pages() -> None:
    """Test _extract_page_numbers with multiple page tags."""
    text = """Page 1 <seite nummer="1" /> Page 2 <seite nummer="2" /> Page 3 <seite nummer="3" />"""
    assert extract_page_numbers(text) == [1, 2, 3]


def test_extract_page_numbers_no_pages() -> None:
    """Test _extract_page_numbers with no page tags."""
    text = "Content without page numbers."
    assert extract_page_numbers(text) == []


def test_extract_page_numbers_invalid_tags() -> None:
    """Test _extract_page_numbers with malformed page tags."""
    text = """Content <seite nummer="abc" /> <seite nummer="1.5" />"""
    # It should only extract valid integers, others will be ignored by int() conversion
    assert extract_page_numbers(text) == []


def test_get_header_level_and_title_header1_numbered() -> None:
    """Test _get_header_level_and_title with a numbered Header 1."""
    metadata = {"Header 1": "1. Introduction"}
    result = get_header_level_and_title(metadata)
    assert result is not None
    level, title = result
    assert level == 1
    assert title == "1. Introduction"


def test_get_header_level_and_title_header2_numbered() -> None:
    """Test _get_header_level_and_title with a numbered Header 2."""
    metadata = {"Header 2": "1.2. Section Title"}
    result = get_header_level_and_title(metadata)
    assert result is not None
    level, title = result
    assert level == 2
    assert title == "1.2. Section Title"


def test_get_header_level_and_title_header3_numbered() -> None:
    """Test _get_header_level_and_title with a numbered Header 3."""
    metadata = {"Header 3": "1.2.3. Sub-Section"}
    result = get_header_level_and_title(metadata)
    assert result is not None
    level, title = result
    assert level == 3
    assert title == "1.2.3. Sub-Section"


def test_get_header_level_and_title_header1_unnumbered() -> None:
    """Test _get_header_level_and_title with an unnumbered Header 1."""
    metadata = {"Header 1": "Introduction"}
    result = get_header_level_and_title(metadata)
    assert result is not None
    level, title = result
    assert level == 1
    assert title == "Introduction"


def test_get_header_level_and_title_multiple_headers() -> None:
    """Test _get_header_level_and_title with multiple headers, ensuring the most specific is chosen."""
    metadata = {"Header 1": "1. Main", "Header 2": "1.1. Sub"}
    result = get_header_level_and_title(metadata)
    assert result is not None
    level, title = result
    assert level == 2  # Should pick Header 2 as it's the most specific (highest level in the loop)
    assert title == "1.1. Sub"


def test_get_header_level_and_title_no_headers() -> None:
    """Test _get_header_level_and_title with no header metadata."""
    metadata = {"Other": "Some value"}
    result = get_header_level_and_title(metadata)
    assert result is None


def test_build_toc_from_content_list_simple() -> None:
    """Test _build_toc_from_content_list with a simple hierarchy."""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Header One"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1.1. SubHeader One"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "2. Header Two"},
    ]
    toc, parent_map = build_toc_from_content_list(content_list)

    expected_toc: dict[str, list[str]] = {
        "_DOCUMENT_ROOT_": ["1. Header One", "2. Header Two"],
        "1. Header One": ["1.1. SubHeader One"],
        "1.1. SubHeader One": [],
        "2. Header Two": [],
    }
    expected_parent_map = {
        "1. Header One": "_DOCUMENT_ROOT_",
        "1.1. SubHeader One": "1. Header One",
        "2. Header Two": "_DOCUMENT_ROOT_",
    }
    assert toc == expected_toc
    assert parent_map == expected_parent_map


def test_build_toc_from_content_list_complex() -> None:
    """Test _build_toc_from_content_list with a more complex hierarchy."""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Top Level"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1.1. Second Level A"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1.1.1. Third Level A"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1.2. Second Level B"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "2. Another Top Level"},
    ]
    toc, parent_map = build_toc_from_content_list(content_list)

    expected_toc: dict[str, list[str]] = {
        "_DOCUMENT_ROOT_": ["1. Top Level", "2. Another Top Level"],
        "1. Top Level": ["1.1. Second Level A", "1.2. Second Level B"],
        "1.1. Second Level A": ["1.1.1. Third Level A"],
        "1.1.1. Third Level A": [],
        "1.2. Second Level B": [],
        "2. Another Top Level": [],
    }
    expected_parent_map = {
        "1. Top Level": "_DOCUMENT_ROOT_",
        "1.1. Second Level A": "1. Top Level",
        "1.1.1. Third Level A": "1.1. Second Level A",
        "1.2. Second Level B": "1. Top Level",
        "2. Another Top Level": "_DOCUMENT_ROOT_",
    }
    assert toc == expected_toc
    assert parent_map == expected_parent_map


def test_build_toc_from_content_list_non_numbered_headers() -> None:
    """Test _build_toc_from_content_list ignores non-numbered headers."""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "Introduction"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Actual Header"},
    ]
    toc, parent_map = build_toc_from_content_list(content_list)
    expected_toc: dict[str, list[str]] = {
        "_DOCUMENT_ROOT_": ["1. Actual Header"],
        "1. Actual Header": [],
    }
    expected_parent_map = {
        "1. Actual Header": "_DOCUMENT_ROOT_",
    }
    assert toc == expected_toc
    assert parent_map == expected_parent_map


def test_get_all_descendants_simple() -> None:
    """Test _get_all_descendants with a simple hierarchy."""
    toc: dict[str, list[str]] = {
        "_DOCUMENT_ROOT_": ["A"],
        "A": ["A.1", "A.2"],
        "A.1": ["A.1.1"],
        "A.1.1": [],
        "A.2": [],
    }
    assert get_all_descendants("A", toc) == ["A.1", "A.1.1", "A.2"]


def test_get_all_descendants_no_children() -> None:
    """Test _get_all_descendants for a header with no children."""
    toc: dict[str, list[str]] = {
        "A": [],
    }
    assert get_all_descendants("A", toc) == []


def test_get_all_descendants_nested() -> None:
    """Test _get_all_descendants with deeply nested children."""
    toc: dict[str, list[str]] = {
        "1.": ["1.1.", "1.2."],
        "1.1.": ["1.1.1.", "1.1.2."],
        "1.1.1.": [],
        "1.1.2.": ["1.1.2.1."],
        "1.1.2.1.": [],
        "1.2.": [],
    }
    assert get_all_descendants("1.", toc) == [
        "1.1.",
        "1.1.1.",
        "1.1.2.",
        "1.1.2.1.",
        "1.2.",
    ]


def test_get_clean_header_numbered() -> None:
    """Test _get_clean_header with a numbered header."""
    metadata = {"Header 2": "1.2.3. My Clean Header"}
    assert get_clean_header(metadata) == "My Clean Header"


def test_get_clean_header_unnumbered() -> None:
    """Test _get_clean_header with an unnumbered header."""
    metadata = {"Header 1": "Introduction"}
    assert get_clean_header(metadata) == "Introduction"


def test_get_clean_header_with_extra_whitespace() -> None:
    """Test _get_clean_header with extra whitespace."""
    metadata = {"Header 3": "  1.2.3.   Another Header   "}
    assert get_clean_header(metadata) == "Another Header"


def test_get_clean_header_no_header_metadata() -> None:
    """Test _get_clean_header with no relevant header metadata."""
    metadata = {"Other": "Value"}
    assert get_clean_header(metadata) is None


def test_is_table_fragment_starts_with_tr() -> None:
    """Test _is_table_fragment for content starting with <tr>."""
    content = "<tr><td>data</td></tr>"
    assert is_table_fragment(content) is True


def test_is_table_fragment_starts_with_td() -> None:
    """Test _is_table_fragment for content starting with <td>."""
    content = "<td>data</td><td>more</td>"
    assert is_table_fragment(content) is True


def test_is_table_fragment_multiple_tags() -> None:
    """Test _is_table_fragment for content with multiple table tags."""
    content = "Some text <td>data</td> <tr><td>row</td></tr>"
    assert is_table_fragment(content) is True


def test_is_table_fragment_not_table() -> None:
    """Test _is_table_fragment for non-table content."""
    content = "This is just plain text."
    assert is_table_fragment(content) is False


def test_is_table_fragment_empty_string() -> None:
    """Test _is_table_fragment with an empty string."""
    content = ""
    assert is_table_fragment(content) is False


def test_is_table_fragment_single_tag_not_enough() -> None:
    """Test _is_table_fragment with only one table tag, which should not be enough."""
    content = "Some text with <td> only one tag."
    assert is_table_fragment(content) is False


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
def test_chunk_markdown_simple_text_and_headers() -> None:
    """Test chunk_markdown with simple text and headers."""
    markdown_content = """
# Header 1
Content for header 1.
<seite nummer="1" />
## Header 1.1
Content for header 1.1.
<seite nummer="2" />
# Header 2
Content for header 2.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Header 1"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1.1. Header 1.1"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "2. Header 2"},
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 3

    assert len(chunks[0].sub_chunks) == 1  # Header and content
    assert len(chunks[1].sub_chunks) == 1  # Header and content
    assert len(chunks[2].sub_chunks) == 1  # Header and content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=100, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config", new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=100, CHUNKING_MAX_CHARACTERS=50)
)
def test_chunk_markdown_oversized_parent_chunk_force_split() -> None:
    """Test chunk_markdown with an oversized parent chunk that needs force-splitting."""
    long_content = "A" * 500  # Exceeds PARENT_CHUNK_MAX_CHARACTERS (100)
    markdown_content = f"""
# Introduction
{long_content}
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Introduction"},
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    # Expect multiple chunks due to force-splitting
    assert len(chunks) > 1
    assert chunks[0].header == "Introduction"
    assert len(chunks[0].page_content) <= 100 + 0  # PARENT_CHUNK_MAX_CHARACTERS + CHUNK_OVERLAP


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
def test_chunk_markdown_with_image() -> None:
    """Test chunk_markdown with an image placeholder."""
    markdown_content = """
# Section with Image
Some text before the image.
<BILD img_path="path/to/image.png"><caption_text>Image Caption</caption_text><summary>Summary of image</summary><description>Description of image</description><content>Content of image</content></BILD>
Some text after the image.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section with Image"},
        {
            "type": "image",
            "page_idx": 0,
            "img_path": "path/to/image.png",
        },
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1  # One main chunk for the section
    assert len(chunks[0].sub_chunks) == 3  # Text before, image, text after


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
def test_chunk_markdown_with_table() -> None:
    """Test chunk_markdown with a table placeholder."""
    markdown_content = """
# Section with Table
Text before table.
<TABELLE img_path="path/to/table.png"><caption_text>Table Caption</caption_text><summary>Summary of table</summary><content><table><tr><td>Header</td></tr><tr><td>Data</td></tr></table></content></TABELLE>
Text after table.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section with Table"},
        {
            "type": "table",
            "page_idx": 0,
            "table_body": "<table><tr><td>Header</td></tr><tr><td>Data</td></tr></table>",
            "img_path": "path/to/table.png",
        },
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    assert len(chunks[0].sub_chunks) == 3  # Text before, table, text after

    # Check table sub-chunk
    table_sub_chunk = chunks[0].sub_chunks[1]
    assert table_sub_chunk.metadata["chunk_type"] == "table"
    assert "<table><tr><td>Header</td></tr><tr><td>Data</td></tr></table>" in table_sub_chunk.page_content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=500),
)
def test_chunk_markdown_with_raw_html_table() -> None:
    """Test chunk_markdown with a raw HTML table (not a placeholder)."""
    markdown_content = """
# Section with Raw Table
Text before raw table.
<table><tr><td>Raw Header</td></tr><tr><td>Raw Data</td></tr></table>
Text after raw table.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section with Raw Table"},
        # Raw HTML tables are not typically in content_list in the same way as processed ones
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    assert len(chunks[0].sub_chunks) == 3  # Text before, table, text after

    # Check table sub-chunk
    table_sub_chunk = chunks[0].sub_chunks[1]
    assert table_sub_chunk.metadata["chunk_type"] == "table"
    assert "<table><tr><td>Raw Header</td></tr><tr><td>Raw Data</td></tr></table>" in table_sub_chunk.page_content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_empty_content() -> None:
    """Test chunk_markdown with empty markdown content."""
    markdown_content = ""
    content_list: list[ContentItemDict] = []
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 0


@patch(
    "src.processors.chunker._build_parent_chunks",
    new=lambda *_: [
        Document(page_content="  ", metadata={}),
        Document(page_content="Valid parent", metadata={}),
    ],
)
@patch(
    "src.processors.chunker.process_text_segment",
    new=lambda *_: [("  ", "text", {}, 0)],
)
def test_chunk_markdown_filters_blank_chunks_and_uses_parent_fallback() -> None:
    """Blank chunks are dropped while valid parent content remains indexable."""
    chunks = MarkdownChunker.chunk_markdown("ignored", [])

    assert len(chunks) == 1
    assert chunks[0].page_content == "Valid parent"
    assert [sub.page_content for sub in chunks[0].sub_chunks] == ["Valid parent"]
    assert all(sub.page_content.strip() for sub in chunks[0].sub_chunks)


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_only_page_tags() -> None:
    """Test chunk_markdown with only page tags."""
    markdown_content = """<seite nummer="1" /><seite nummer="2" />"""
    content_list: list[ContentItemDict] = []
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1  # Should not create chunks for only page tags


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_header_only_chunk_merging() -> None:
    """Test that header-only sub-chunks are merged with the next sub-chunk."""
    markdown_content = """
# My Header
Content starts here.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. My Header"},
    ]
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    assert len(chunks[0].sub_chunks) == 1  # Header and content should be merged
    assert "My Header" in chunks[0].sub_chunks[0].page_content
    assert "Content starts here." in chunks[0].sub_chunks[0].page_content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_page_number_tracking() -> None:
    """Test that page numbers are correctly tracked across chunks and sub-chunks."""
    markdown_content = """
# Section A
Content on page 1. <seite nummer="1" />
More content on page 1.
<seite nummer="2" />
Content on page 2.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section A"},
    ]
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    main_chunk = chunks[0]
    assert main_chunk.metadata["page_numbers"] == [1, 2]

    # Assuming sub-chunks are split by page tags
    # The exact number of sub-chunks might vary based on CHUNKING_MAX_CHARACTERS
    # but we can check the page numbers within them.

    # Find sub-chunk containing "Content on page 1."
    page1_sub_chunks = [sc for sc in main_chunk.sub_chunks if "Content on page 1." in sc.page_content]
    assert len(page1_sub_chunks) > 0
    for sc in page1_sub_chunks:
        assert 1 in sc.metadata["page_numbers"]
        assert 2 not in sc.metadata["page_numbers"]

    # Find sub-chunk containing "Content on page 2."
    page2_sub_chunks = [sc for sc in main_chunk.sub_chunks if "Content on page 2." in sc.page_content]
    assert len(page2_sub_chunks) > 0
    for sc in page2_sub_chunks:
        assert 1 in sc.metadata["page_numbers"]
        assert 2 not in sc.metadata["page_numbers"]


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_table_row_splitting() -> None:
    """Test that large tables are split by rows into multiple sub-chunks."""
    long_row = "<td>" + "Long Data " * 20 + "</td>"  # Exceeds CHUNKING_MAX_CHARACTERS (50)
    markdown_content = f"""
# Table Section
<table>
    <tr><th>Header 1</th><th>Header 2</th></tr>
    <tr>{long_row}</tr>
    <tr><td>Short Data</td><td>More Short Data</td></tr>
</table>
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Table Section"},
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    main_chunk = chunks[0]

    table_sub_chunks = [sc for sc in main_chunk.sub_chunks if sc.metadata.get("chunk_type") == "table"]
    assert len(table_sub_chunks) > 1  # Expect more than one sub-chunk for the table

    # Check that each table sub-chunk contains valid HTML table structure
    for sc in table_sub_chunks:
        assert "<table>" in sc.page_content
        assert "</table>" in sc.page_content
        assert "<tr>" in sc.page_content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_context_linking() -> None:
    """Test that text chunks adjacent to special elements are linked for context."""
    markdown_content = """
Text before image.
<BILD img_path="path/to/image.png"></BILD>
Text after image.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Context Section"},
        {"type": "image", "page_idx": 0, "img_path": "path/to/image.png"},
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    assert len(chunks[0].sub_chunks) == 2


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=1000, CHUNKING_MAX_CHARACTERS=50),
)
def test_chunk_markdown_parent_chunk_content_cleaned() -> None:
    """Test that img_path is removed from parent_chunk_content in sub-chunks."""
    markdown_content = """
# Section
<BILD img_path="path/to/image.png"></BILD>
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section"},
        {"type": "image", "page_idx": 0, "img_path": "path/to/image.png"},
    ]
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    main_chunk = chunks[0]

    # The main chunk's page_content should have img_path removed
    assert "img_path" not in main_chunk.page_content

    # All sub-chunks should also have cleaned parent_chunk_content
    for sub_chunk in main_chunk.sub_chunks:
        if "parent_chunk_content" in sub_chunk.metadata:
            assert "img_path" not in sub_chunk.metadata["parent_chunk_content"]


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=5000, CHUNKING_MAX_CHARACTERS=200),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=5000, CHUNKING_MAX_CHARACTERS=200),
)
def test_chunk_markdown_large_tabelle_creates_semantic_sub_chunks() -> None:
    """Test that large TABELLE elements create separate sub-chunks for semantic content.

    This tests the fix for a bug where large tables only created sub-chunks for HTML rows,
    but not for summary/description/caption - meaning semantic content was not embedded
    in the vector database.

    Expected behavior (aligned with image handling):
    - Large TABELLE should create separate sub-chunks for caption, summary, description
    - Then split table content by rows
    """
    # Create a large table with multiple rows that exceeds CHUNKING_MAX_CHARACTERS (200)
    # Each row has ~100 chars, so 20 rows = ~2000 chars total
    rows = "".join([f"<tr><td>Row {i} with some data content here</td><td>Value {i}</td></tr>" for i in range(20)])
    long_table_content = f"<table><tbody>{rows}</tbody></table>"

    # The full TABELLE element should be > 200 chars to trigger splitting
    # Note: Tag order must match regex: caption_text, content, description, summary
    markdown_content = f"""# Section with Large Table
<TABELLE img_path="path/to/table.png"><caption_text>Table 1: Species Inventory</caption_text><content>{long_table_content}</content><description>Detailed inventory of 47 species with population data</description><summary>This table shows protected species in the project area</summary></TABELLE>
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "1. Section with Large Table"},
    ]

    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    assert len(chunks) == 1
    main_chunk = chunks[0]

    # Get all table sub-chunks
    table_sub_chunks = [sc for sc in main_chunk.sub_chunks if sc.metadata.get("chunk_type") == "table"]

    # Should have multiple sub-chunks (semantic + content rows)
    assert len(table_sub_chunks) > 1, f"Large table should create multiple sub-chunks, got {len(table_sub_chunks)}"

    # Collect all page_content from table sub-chunks
    all_page_content = " ".join(sc.page_content for sc in table_sub_chunks)

    # Verify semantic content is in page_content (and thus will be embedded)
    assert "<caption_text>" in all_page_content or "Table 1: Species Inventory" in all_page_content, (
        f"Caption should be in a sub-chunk's page_content for embedding. Got: {all_page_content[:500]}"
    )
    assert "<summary>" in all_page_content or "protected species" in all_page_content, (
        f"Summary should be in a sub-chunk's page_content for embedding. Got: {all_page_content[:500]}"
    )
    assert "<description>" in all_page_content or "Detailed inventory" in all_page_content, (
        f"Description should be in a sub-chunk's page_content for embedding. Got: {all_page_content[:500]}"
    )

    # Verify table HTML rows are also present
    assert "<table>" in all_page_content, "Table HTML should be in sub-chunks"
    assert "<tr>" in all_page_content, "Table rows should be in sub-chunks"


# ---------------------------------------------------------------------------
# Tests for _merge_header_only_parent_chunks
# ---------------------------------------------------------------------------


def test_merge_header_only_parent_chunks_single_header_then_content() -> None:
    """A single header-only split is prepended to the next content split."""
    splits = [
        Document(page_content='<seite nummer="1" />\n\n## Heading A', metadata={}),
        Document(page_content="Body text here.", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 1
    assert "## Heading A" in result[0].page_content
    assert "Body text here." in result[0].page_content


def test_merge_header_only_parent_chunks_multiple_consecutive() -> None:
    """Multiple consecutive header-only splits accumulate into the first content split."""
    splits = [
        Document(page_content="## Heading A", metadata={}),
        Document(page_content='<seite nummer="2" />\n\n## Heading B', metadata={}),
        Document(page_content="Actual body content.", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 1
    assert "## Heading A" in result[0].page_content
    assert "## Heading B" in result[0].page_content
    assert "Actual body content." in result[0].page_content


def test_merge_header_only_parent_chunks_trailing_header() -> None:
    """A trailing header-only split is appended to the previous chunk."""
    splits = [
        Document(page_content="Body text.", metadata={}),
        Document(page_content="## Trailing Heading", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 1
    assert "Body text." in result[0].page_content
    assert "## Trailing Heading" in result[0].page_content


def test_merge_header_only_parent_chunks_placeholder_not_merged() -> None:
    """A split with a heading + placeholder is NOT header-only (has image/table content)."""
    splits = [
        Document(
            page_content="## Heading\n\n__SPECIAL_ELEMENT_PLACEHOLDER_0__",
            metadata={},
        ),
        Document(page_content="Next section.", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 2
    assert "PLACEHOLDER" in result[0].page_content
    assert "Next section." in result[1].page_content


def test_merge_header_only_parent_chunks_page_tag_only() -> None:
    """A split with heading + page tag only IS header-only (page tags are stripped)."""
    splits = [
        Document(
            page_content='<seite nummer="5" />\n\n## Just a Heading',
            metadata={},
        ),
        Document(page_content="Content follows.", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 1
    assert "## Just a Heading" in result[0].page_content
    assert "Content follows." in result[0].page_content


def test_merge_header_only_parent_chunks_no_header_only() -> None:
    """When no splits are header-only, the list is returned unchanged."""
    splits = [
        Document(page_content="Content A.", metadata={}),
        Document(page_content="Content B.", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 2
    assert result[0].page_content == "Content A."
    assert result[1].page_content == "Content B."


def test_merge_header_only_parent_chunks_all_headers() -> None:
    """When all splits are header-only, they collapse into a single split."""
    splits = [
        Document(page_content="## Heading A", metadata={}),
        Document(page_content="## Heading B", metadata={}),
        Document(page_content="## Heading C", metadata={}),
    ]
    result = MarkdownChunker._merge_header_only_parent_chunks(splits)
    assert len(result) == 1
    assert "## Heading A" in result[0].page_content
    assert "## Heading B" in result[0].page_content
    assert "## Heading C" in result[0].page_content


@patch(
    "src.processors.sub_chunk_builder.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=5000, CHUNKING_MAX_CHARACTERS=500),
)
@patch(
    "src.processors.chunker.get_config",
    new=lambda: Config(PARENT_CHUNK_MAX_CHARACTERS=5000, CHUNKING_MAX_CHARACTERS=500),
)
def test_chunk_markdown_consecutive_headings_merged() -> None:
    """Integration: consecutive headings in markdown produce merged parent chunks."""
    markdown_content = """
## IAW - Industrielle Abwärme
<seite nummer="1" />
## Zusammenfassung
Hier steht der eigentliche Inhalt des Dokuments.
"""
    content_list: list[ContentItemDict] = [
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "IAW - Industrielle Abwärme"},
        {"type": "text", "page_idx": 0, "text_level": 1, "text": "Zusammenfassung"},
    ]
    chunks = MarkdownChunker.chunk_markdown(markdown_content, content_list)
    # The header-only "IAW" split should be merged into the "Zusammenfassung" chunk
    assert len(chunks) == 1
    assert "IAW" in chunks[0].page_content
    assert "Zusammenfassung" in chunks[0].page_content
    assert "Inhalt des Dokuments" in chunks[0].page_content
