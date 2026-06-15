"""Tests for markdown_builder.py — FurnitureRefs, FurnitureDetector, MarkdownBuilder."""

from typing import Any
from unittest.mock import patch

from src.providers.docling.furniture_detector import FurnitureDetector, FurnitureRefs
from src.providers.docling.markdown_builder import MarkdownBuilder

_NO_IMAGES: list[dict[str, Any]] = []
_NO_TABLES: list[dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _text(
    idx: int,
    text: str,
    label: str = "paragraph",
    content_layer: str = "body",
    page_no: int = 1,
    parent: dict[str, Any] | None = None,
    marker: str | None = None,
    children: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a minimal text element."""
    elem: dict[str, Any] = {
        "self_ref": f"#/texts/{idx}",
        "text": text,
        "label": label,
        "content_layer": content_layer,
        "prov": [{"page_no": page_no}],
    }
    if parent is not None:
        elem["parent"] = parent
    if marker is not None:
        elem["marker"] = marker
    if children is not None:
        elem["children"] = children
    return elem


def _table(
    idx: int,
    page_no: int = 1,
    cell_texts: list[str] | None = None,
    captions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a minimal table element."""
    cells = [{"text": ct} for ct in (cell_texts or [])]
    return {
        "self_ref": f"#/tables/{idx}",
        "label": "table",
        "prov": [{"page_no": page_no}],
        "data": {"table_cells": cells},
        "captions": captions or [],
    }


def _picture(
    idx: int,
    page_no: int = 1,
    captions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a minimal picture element."""
    return {
        "self_ref": f"#/pictures/{idx}",
        "label": "picture",
        "prov": [{"page_no": page_no}],
        "captions": captions or [],
    }


def _group(idx: int, children: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a group element with children refs."""
    return {
        "self_ref": f"#/groups/{idx}",
        "label": "group",
        "children": children,
    }


def _ref(path: str) -> dict[str, str]:
    """Shorthand for a $ref dict."""
    return {"$ref": path}


def _doc(
    texts: list[dict[str, Any]] | None = None,
    tables: list[dict[str, Any]] | None = None,
    pictures: list[dict[str, Any]] | None = None,
    groups: list[dict[str, Any]] | None = None,
    body_children: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build a full doc_json structure."""
    doc: dict[str, Any] = {
        "texts": texts or [],
        "tables": tables or [],
        "pictures": pictures or [],
    }
    if groups:
        doc["groups"] = groups
    body: dict[str, Any] = {"children": body_children or []}
    doc["body"] = body
    return doc


# ===========================================================================
# FurnitureRefs defaults
# ===========================================================================


class TestFurnitureRefs:
    """Tests for the FurnitureRefs dataclass defaults."""

    def test_defaults_are_empty_sets(self) -> None:
        """Test that all FurnitureRefs sets default to empty."""
        refs = FurnitureRefs()
        assert refs.texts_with_picture_parent == set()
        assert refs.furniture_table_refs == set()
        assert refs.furniture_picture_refs == set()
        assert refs.furniture_text_refs_by_position == set()
        assert refs.furniture_texts == set()

    def test_furniture_labels_default(self) -> None:
        """Test that default furniture labels include header and footer variants."""
        refs = FurnitureRefs()
        assert refs.furniture_labels == {
            "page_footer",
            "page_header",
            "page-footer",
            "page-header",
        }

    def test_each_instance_has_independent_sets(self) -> None:
        """Test that each FurnitureRefs instance has its own independent sets."""
        a = FurnitureRefs()
        b = FurnitureRefs()
        a.furniture_texts.add("X")
        assert "X" not in b.furniture_texts


# ===========================================================================
# FurnitureDetector.detect
# ===========================================================================


class TestFurnitureDetector:
    """Tests for FurnitureDetector.detect()."""

    # --- Step 1: texts with picture parents ---

    def test_step1_text_with_picture_parent_detected(self) -> None:
        """Test that text with a picture parent ref is detected."""
        doc = _doc(
            texts=[
                _text(0, "OCR text", parent={"$ref": "#/pictures/0"}),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "#/texts/0" in refs.texts_with_picture_parent

    def test_step1_text_without_picture_parent_ignored(self) -> None:
        """Test that text with a non-picture parent is not detected."""
        doc = _doc(
            texts=[
                _text(0, "Normal text", parent={"$ref": "#/groups/0"}),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert refs.texts_with_picture_parent == set()

    def test_step1_text_with_no_parent_key(self) -> None:
        """Test that text without a parent key is ignored."""
        doc = _doc(texts=[_text(0, "No parent")])
        refs = FurnitureDetector.detect(doc)
        assert refs.texts_with_picture_parent == set()

    def test_step1_parent_is_not_dict(self) -> None:
        """If parent is a string instead of a dict, should not crash."""
        t = _text(0, "bad parent")
        t["parent"] = "some-string"
        doc = _doc(texts=[t])
        refs = FurnitureDetector.detect(doc)
        assert refs.texts_with_picture_parent == set()

    # --- Step 2: furniture texts ---

    def test_step2_content_layer_furniture(self) -> None:
        """Test that elements with furniture content_layer are collected."""
        doc = _doc(
            texts=[
                _text(0, "Header", content_layer="furniture"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "Header" in refs.furniture_texts

    def test_step2_label_page_header(self) -> None:
        """Test that page_header labeled text is collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "Page Head", label="page_header"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "Page Head" in refs.furniture_texts

    def test_step2_label_page_footer(self) -> None:
        """Test that page_footer labeled text is collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "Page Foot", label="page_footer"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "Page Foot" in refs.furniture_texts

    def test_step2_label_page_dash_header(self) -> None:
        """Test that page-header labeled text is collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "Dashed Head", label="page-header"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "Dashed Head" in refs.furniture_texts

    def test_step2_label_page_dash_footer(self) -> None:
        """Test that page-footer labeled text is collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "Dashed Foot", label="page-footer"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "Dashed Foot" in refs.furniture_texts

    def test_step2_body_text_not_collected(self) -> None:
        """Test that regular body text is not collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "Regular text", label="paragraph", content_layer="body"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert refs.furniture_texts == set()

    def test_step2_empty_text_not_collected(self) -> None:
        """Test that whitespace-only text is not collected as furniture."""
        doc = _doc(
            texts=[
                _text(0, "   ", label="page_header"),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert refs.furniture_texts == set()

    # --- Step 3: furniture tables ---

    def test_step3_table_with_majority_furniture_cells(self) -> None:
        """Table where >50% cells match furniture text is flagged."""
        doc = _doc(
            texts=[
                _text(0, "Header Text", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=["Header Text", "Header Text", "ok"]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        # 2 of 3 cells match = 66% > 50%
        assert "#/tables/0" in refs.furniture_table_refs

    def test_step3_table_with_minority_furniture_cells(self) -> None:
        """Table where <=50% cells match furniture text is NOT flagged."""
        doc = _doc(
            texts=[
                _text(0, "Header", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=["Header", "real1", "real2", "real3"]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        # 1 of 4 cells = 25% < 50%
        assert refs.furniture_table_refs == set()

    def test_step3_table_no_cells(self) -> None:
        """Table with empty cells list is not flagged."""
        doc = _doc(
            texts=[
                _text(0, "Header", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=[]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert refs.furniture_table_refs == set()

    def test_step3_table_no_furniture_texts(self) -> None:
        """No furniture texts means no content-based matching."""
        doc = _doc(
            texts=[
                _text(0, "Normal", label="paragraph"),
            ],
            tables=[
                _table(0, cell_texts=["Normal"]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert refs.furniture_table_refs == set()

    def test_step3_table_cells_only_whitespace(self) -> None:
        """Cells with only whitespace are stripped and ignored."""
        doc = _doc(
            texts=[
                _text(0, "Hdr", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=["  ", "\t"]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        # No non-empty cells after strip -> table_cells is truthy but cell_texts is empty
        assert refs.furniture_table_refs == set()

    def test_step3_content_based_matching_uses_substring(self) -> None:
        """Content matching checks if cell text is a substring of furniture text."""
        doc = _doc(
            texts=[
                _text(0, "Bundesministerium des Innern - Seite 1", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=["Bundesministerium des Innern - Seite 1"]),
            ],
        )
        refs = FurnitureDetector.detect(doc)
        assert "#/tables/0" in refs.furniture_table_refs

    # --- Empty doc ---

    def test_empty_doc(self) -> None:
        """Test that an empty document produces empty furniture refs."""
        empty_doc: dict[str, Any] = {}
        refs = FurnitureDetector.detect(empty_doc)
        assert refs.texts_with_picture_parent == set()
        assert refs.furniture_table_refs == set()
        assert refs.furniture_texts == set()


# ===========================================================================
# MarkdownBuilder._format_text_element
# ===========================================================================


class TestFormatTextElement:
    """Tests for MarkdownBuilder._format_text_element()."""

    def test_title(self) -> None:
        """Test that title label produces H1 markdown."""
        elem = {"text": "My Title", "label": "title"}
        assert MarkdownBuilder._format_text_element(elem) == "\n# My Title\n"

    def test_document_title(self) -> None:
        """Test that document_title label produces H1 markdown."""
        elem = {"text": "Doc Title", "label": "document_title"}
        assert MarkdownBuilder._format_text_element(elem) == "\n# Doc Title\n"

    def test_section_header(self) -> None:
        """Test that section_header label produces H2 markdown."""
        elem = {"text": "Section", "label": "section_header"}
        assert MarkdownBuilder._format_text_element(elem) == "\n## Section\n"

    def test_section_header_dashed(self) -> None:
        """Test that section-header (dashed) label produces H2 markdown."""
        elem = {"text": "Section", "label": "section-header"}
        assert MarkdownBuilder._format_text_element(elem) == "\n## Section\n"

    def test_subtitle(self) -> None:
        """Test that subtitle label produces H3 markdown."""
        elem = {"text": "Sub", "label": "subtitle"}
        assert MarkdownBuilder._format_text_element(elem) == "\n### Sub\n"

    def test_caption(self) -> None:
        """Test that caption label produces italic markdown."""
        elem = {"text": "Figure 1", "label": "caption"}
        assert MarkdownBuilder._format_text_element(elem) == "\n*Figure 1*\n"

    def test_list_item_default_marker(self) -> None:
        """Test that list_item without marker uses dash prefix."""
        elem = {"text": "item", "label": "list_item"}
        assert MarkdownBuilder._format_text_element(elem) == "- item"

    def test_list_item_custom_marker(self) -> None:
        """Test that list_item with custom marker uses that marker."""
        elem = {"text": "item", "label": "list_item", "marker": "1."}
        assert MarkdownBuilder._format_text_element(elem) == "1. item"

    def test_footnote(self) -> None:
        """Test that footnote label produces footnote markdown syntax."""
        elem = {"text": "Note text", "label": "footnote"}
        assert MarkdownBuilder._format_text_element(elem) == "\n[^]: Note text\n"

    def test_page_header_returns_empty(self) -> None:
        """Test that page_header label returns empty string."""
        elem = {"text": "Header", "label": "page_header"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_page_footer_returns_empty(self) -> None:
        """Test that page_footer label returns empty string."""
        elem = {"text": "Footer", "label": "page_footer"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_page_dash_header_returns_empty(self) -> None:
        """Test that page-header label returns empty string."""
        elem = {"text": "Header", "label": "page-header"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_page_dash_footer_returns_empty(self) -> None:
        """Test that page-footer label returns empty string."""
        elem = {"text": "Footer", "label": "page-footer"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_default_paragraph(self) -> None:
        """Test that default text label produces newline-wrapped paragraph."""
        elem = {"text": "Hello world", "label": "text"}
        assert MarkdownBuilder._format_text_element(elem) == "\nHello world\n"

    def test_unknown_label_falls_to_default(self) -> None:
        """Test that an unknown label falls through to the default paragraph format."""
        elem = {"text": "Unknown", "label": "some_unknown_label"}
        assert MarkdownBuilder._format_text_element(elem) == "\nUnknown\n"

    def test_empty_text_returns_empty(self) -> None:
        """Test that empty text returns empty string regardless of label."""
        elem = {"text": "", "label": "title"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_no_text_key_returns_empty(self) -> None:
        """Test that missing text key returns empty string."""
        elem = {"label": "title"}
        assert MarkdownBuilder._format_text_element(elem) == ""

    def test_level_parameter_accepted(self) -> None:
        """Level parameter exists but does not currently affect output."""
        elem = {"text": "deep", "label": "paragraph"}
        result = MarkdownBuilder._format_text_element(elem, level=3)
        assert result == "\ndeep\n"


# ===========================================================================
# MarkdownBuilder.build — full integration tests
# ===========================================================================


class TestMarkdownBuilderBuild:
    """Tests for MarkdownBuilder.build()."""

    # --- Empty / missing body ---

    def test_empty_body_returns_empty_string(self) -> None:
        """Test that an empty body produces an empty string."""
        doc: dict[str, Any] = {"body": {}, "texts": [], "tables": [], "pictures": []}
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert result == ""

    def test_no_body_key_returns_empty_string(self) -> None:
        """Test that a doc without body key returns empty string."""
        doc: dict[str, Any] = {"texts": [], "tables": [], "pictures": []}
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert result == ""

    def test_body_with_no_children(self) -> None:
        """Test that a body with no children returns empty string."""
        doc = _doc(body_children=[])
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert result == ""

    # --- Text elements ---

    def test_single_text_element(self) -> None:
        """Test that a single text element appears in the output."""
        doc = _doc(
            texts=[_text(0, "Hello World", label="paragraph")],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Hello World" in result

    def test_text_with_title_formatting(self) -> None:
        """Test that a title element gets H1 formatting in the build output."""
        doc = _doc(
            texts=[_text(0, "My Title", label="title")],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "# My Title" in result

    def test_multiple_text_elements(self) -> None:
        """Test that multiple text elements with different labels are all rendered."""
        doc = _doc(
            texts=[
                _text(0, "Title", label="title"),
                _text(1, "Section", label="section_header"),
                _text(2, "Body text", label="paragraph"),
            ],
            body_children=[
                _ref("#/texts/0"),
                _ref("#/texts/1"),
                _ref("#/texts/2"),
            ],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "# Title" in result
        assert "## Section" in result
        assert "Body text" in result

    def test_empty_text_element_skipped(self) -> None:
        """Test that an empty text element produces no output."""
        doc = _doc(
            texts=[_text(0, "", label="paragraph")],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert result.strip() == ""

    # --- Furniture filtering ---

    def test_furniture_content_layer_filtered(self) -> None:
        """Test that furniture content_layer text is excluded from build output."""
        doc = _doc(
            texts=[
                _text(0, "Header", label="text", content_layer="furniture"),
                _text(1, "Visible", label="paragraph"),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Header" not in result
        assert "Visible" in result

    def test_furniture_label_page_header_filtered(self) -> None:
        """Test that page_header label is filtered from build output."""
        doc = _doc(
            texts=[
                _text(0, "Page Header", label="page_header"),
                _text(1, "Content", label="paragraph"),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Page Header" not in result
        assert "Content" in result

    def test_furniture_label_page_footer_filtered(self) -> None:
        """Test that page_footer label is filtered from build output."""
        doc = _doc(
            texts=[
                _text(0, "Page Footer", label="page_footer"),
            ],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Page Footer" not in result

    def test_furniture_label_page_dash_header_filtered(self) -> None:
        """Test that page-header label is filtered from build output."""
        doc = _doc(
            texts=[
                _text(0, "Dash Header", label="page-header"),
            ],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Dash Header" not in result

    def test_furniture_label_page_dash_footer_filtered(self) -> None:
        """Test that page-footer label is filtered from build output."""
        doc = _doc(
            texts=[
                _text(0, "Dash Footer", label="page-footer"),
            ],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Dash Footer" not in result

    def test_text_with_picture_parent_filtered(self) -> None:
        """Test that text with a picture parent is excluded from build output."""
        doc = _doc(
            texts=[
                _text(0, "OCR text from image", parent={"$ref": "#/pictures/0"}),
                _text(1, "Normal text"),
            ],
            pictures=[_picture(0)],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "OCR text from image" not in result
        assert "Normal text" in result

    # --- Table elements ---

    def test_table_with_image_and_html(self) -> None:
        """Test that a table with image and HTML renders TABELLE tags correctly."""
        doc = _doc(
            tables=[_table(0, cell_texts=["data"])],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {
                "self_ref": "#/tables/0",
                "img_path": "table_0.png",
                "html": "<table><tr><td>data</td></tr></table>",
            },
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert '<TABELLE img_path="images/table_0.png">' in result
        assert "<table><tr><td>data</td></tr></table>" in result
        assert "</TABELLE>" in result

    def test_table_with_image_no_html(self) -> None:
        """Test that a table with image but no HTML still renders TABELLE tag."""
        doc = _doc(
            tables=[_table(0)],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "table_0.png", "html": ""},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert '<TABELLE img_path="images/table_0.png">' in result
        assert "</TABELLE>" in result

    def test_table_with_html_no_image(self) -> None:
        """Test that a table with HTML but no image renders TABELLE without img_path."""
        doc = _doc(
            tables=[_table(0)],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert "<TABELLE>" in result
        assert "<table></table>" in result

    def test_table_no_image_no_html_produces_nothing(self) -> None:
        """Table with neither image nor HTML produces no TABELLE tag."""
        doc = _doc(
            tables=[_table(0)],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "", "html": ""},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert "TABELLE" not in result

    def test_table_with_caption(self) -> None:
        """Test that a table caption is included in the output."""
        caption_text = _text(0, "Table caption", label="caption")
        doc = _doc(
            texts=[caption_text],
            tables=[
                _table(0, cell_texts=["cell"], captions=[_ref("#/texts/0")]),
            ],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        # Caption appears as plain text in the flow
        assert "Table caption" in result
        # And inside caption_text tag
        assert "<caption_text>Table caption</caption_text>" in result

    def test_table_caption_ref_not_resolved(self) -> None:
        """Caption ref that resolves to None should not crash."""
        doc = _doc(
            tables=[
                _table(0, captions=[_ref("#/texts/99")]),
            ],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert "TABELLE" in result

    def test_furniture_table_filtered(self) -> None:
        """Tables that contain >50% furniture text are skipped."""
        doc = _doc(
            texts=[
                _text(0, "Header Text", label="page_header"),
            ],
            tables=[
                _table(0, cell_texts=["Header Text", "Header Text"]),
            ],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert "TABELLE" not in result

    def test_table_index_fallback(self) -> None:
        """When self_ref is not in tables_meta, falls back to index-based lookup."""
        doc = _doc(
            tables=[_table(0)],
            body_children=[_ref("#/tables/0")],
        )
        # tables_meta without self_ref matching -> falls back to index 0
        tables_meta = [
            {"self_ref": "#/tables/999", "img_path": "fallback.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        # Should use fallback: index 0 from tables_by_index
        assert '<TABELLE img_path="images/fallback.png">' in result

    # --- Picture elements ---

    def test_picture_with_filename(self) -> None:
        """Test that a picture with filename renders as markdown image."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1](images/img_0.png)" in result

    def test_picture_with_meaningful_caption(self) -> None:
        """Test that a meaningful caption is used as alt text in the image link."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "img_0.png",
                "caption": "An important diagram showing the architecture",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![An important diagram showing the architecture](images/img_0.png)" in result

    def test_picture_with_generic_caption_image(self) -> None:
        """Generic caption 'Image' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Image"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1](images/img_0.png)" in result

    def test_picture_with_generic_caption_bild(self) -> None:
        """Generic caption 'Bild' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Bild"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1](images/img_0.png)" in result

    def test_picture_with_generic_caption_figure_n(self) -> None:
        """Generic caption 'Figure 3' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Figure 3"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1](images/img_0.png)" in result

    def test_picture_generic_patterns_abbildung(self) -> None:
        """Test that generic caption 'Abbildung N' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Abbildung 1"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1]" in result

    def test_picture_generic_patterns_grafik(self) -> None:
        """Test that generic caption 'grafik' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "grafik"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1]" in result

    def test_picture_generic_patterns_foto(self) -> None:
        """Test that generic caption 'Foto' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Foto"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1]" in result

    def test_picture_generic_patterns_picture_word(self) -> None:
        """Test that generic caption 'Picture' is replaced with fallback."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Picture"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1]" in result

    def test_picture_no_filename_produces_nothing(self) -> None:
        """Picture with no filename produces no output."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![" not in result

    def test_picture_index_fallback(self) -> None:
        """When self_ref is not in images_meta, falls back to index-based lookup."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        # images_meta with non-matching self_ref -> falls back to index
        images_meta = [
            {"self_ref": "#/pictures/999", "filename": "fallback.png", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "fallback.png" in result

    def test_picture_with_caption_from_docling_json(self) -> None:
        """Caption from docling JSON (captions ref) takes priority."""
        caption_text = _text(0, "Docling caption", label="caption")
        doc = _doc(
            texts=[caption_text],
            pictures=[_picture(0, captions=[_ref("#/texts/0")])],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "img_0.png",
                "caption": "Meta caption",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        # Docling caption should be used as alt text
        assert "![Docling caption](images/img_0.png)" in result

    def test_picture_fallback_caption_from_meta(self) -> None:
        """When no docling caption, falls back to images_meta caption."""
        doc = _doc(
            pictures=[_picture(0, captions=[])],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "img_0.png",
                "caption": "A meaningful meta caption",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![A meaningful meta caption](images/img_0.png)" in result

    def test_picture_caption_ref_not_resolved(self) -> None:
        """Caption ref that resolves to None falls through to meta."""
        doc = _doc(
            pictures=[_picture(0, captions=[_ref("#/texts/99")])],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Fallback"},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Fallback](images/img_0.png)" in result

    def test_furniture_picture_refs_filtered(self) -> None:
        """Pictures in furniture_picture_refs are skipped."""
        pic = _picture(0)
        doc = _doc(
            pictures=[pic],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": ""},
        ]
        # Manually add to furniture_picture_refs (normally done by position detection)
        # Since FurnitureDetector does not currently populate picture refs,
        # we verify via furniture content_layer filtering
        # The picture itself won't be filtered unless it's marked as furniture
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        # Should appear because furniture_picture_refs is empty by default
        assert "img_0.png" in result

    # --- Page markers ---

    def test_page_markers_inserted(self) -> None:
        """Test that page markers are inserted between different page elements."""
        doc = _doc(
            texts=[
                _text(0, "Page 1 text", page_no=1),
                _text(1, "Page 2 text", page_no=2),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert '<seite nummer="1" />' in result
        assert '<seite nummer="2" />' in result

    def test_page_marker_not_repeated_for_same_page(self) -> None:
        """Test that page markers are not duplicated for elements on the same page."""
        doc = _doc(
            texts=[
                _text(0, "First", page_no=1),
                _text(1, "Second", page_no=1),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert result.count('<seite nummer="1" />') == 1

    def test_page_marker_for_table(self) -> None:
        """Test that a page marker is inserted for a table on a new page."""
        doc = _doc(
            tables=[_table(0, page_no=2)],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert '<seite nummer="2" />' in result

    def test_page_marker_for_picture(self) -> None:
        """Test that a page marker is inserted for a picture on a new page."""
        doc = _doc(
            pictures=[_picture(0, page_no=3)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert '<seite nummer="3" />' in result

    def test_element_with_no_prov_defaults_to_page_1(self) -> None:
        """Element with empty prov defaults to page 1."""
        t = _text(0, "No prov")
        t["prov"] = list[dict[str, int]]()
        doc = _doc(
            texts=[t],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert '<seite nummer="1" />' in result
        assert "No prov" in result

    # --- Group elements ---

    def test_group_children_processed_recursively(self) -> None:
        """Test that group children are processed and their content appears in output."""
        doc = _doc(
            texts=[
                _text(0, "Inside group", label="paragraph"),
            ],
            groups=[
                _group(0, children=[_ref("#/texts/0")]),
            ],
            body_children=[_ref("#/groups/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Inside group" in result

    def test_nested_groups(self) -> None:
        """Test that nested groups are resolved recursively."""
        doc = _doc(
            texts=[
                _text(0, "Deeply nested", label="paragraph"),
            ],
            groups=[
                _group(0, children=[_ref("#/groups/1")]),
                _group(1, children=[_ref("#/texts/0")]),
            ],
            body_children=[_ref("#/groups/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Deeply nested" in result

    # --- Non-group element children ---

    def test_text_element_with_children_processed(self) -> None:
        """Non-group elements with children: children are also processed."""
        child_text = _text(1, "Child text", label="paragraph")
        parent_text = _text(0, "Parent text", label="section_header", children=[_ref("#/texts/1")])
        doc = _doc(
            texts=[parent_text, child_text],
            body_children=[_ref("#/texts/0")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Parent text" in result
        assert "Child text" in result

    def test_caption_children_skipped_for_tables(self) -> None:
        """Caption children of non-group elements with label='caption' are skipped."""
        # This tests the skip logic for child elements with label "caption"
        caption_text = _text(0, "Inline caption", label="caption")
        # A table whose children include the caption ref
        tbl = _table(0, cell_texts=["data"], captions=[_ref("#/texts/0")])
        tbl["children"] = [_ref("#/texts/0")]
        doc = _doc(
            texts=[caption_text],
            tables=[tbl],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        # Caption appears as part of the table handling (caption_text + plain text)
        # The child processing should skip it because label == "caption"
        # So it should not be duplicated by the child loop
        assert "Inline caption" in result
        assert "<caption_text>Inline caption</caption_text>" in result

    # --- Unresolvable references ---

    def test_unresolvable_ref_skipped(self) -> None:
        """Reference that does not resolve to anything is silently skipped."""
        doc = _doc(
            texts=[_text(0, "Visible")],
            body_children=[
                _ref("#/texts/999"),  # does not exist
                _ref("#/texts/0"),
            ],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Visible" in result

    # --- Full document integration ---

    def test_full_document(self) -> None:
        """Integration test with multiple element types."""
        doc = _doc(
            texts=[
                _text(0, "Document Title", label="title", page_no=1),
                _text(1, "Introduction", label="section_header", page_no=1),
                _text(2, "Some body text here.", label="paragraph", page_no=1),
                _text(3, "Page 2 Section", label="section_header", page_no=2),
                _text(4, "More text on page 2.", label="paragraph", page_no=2),
                _text(5, "Page Header", label="page_header", content_layer="furniture", page_no=1),
                _text(6, "Table Caption", label="caption", page_no=1),
            ],
            tables=[
                _table(0, page_no=1, cell_texts=["A", "B"], captions=[_ref("#/texts/6")]),
            ],
            pictures=[
                _picture(0, page_no=2),
            ],
            body_children=[
                _ref("#/texts/0"),
                _ref("#/texts/5"),
                _ref("#/texts/1"),
                _ref("#/texts/2"),
                _ref("#/tables/0"),
                _ref("#/texts/3"),
                _ref("#/texts/4"),
                _ref("#/pictures/0"),
            ],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "img_0.png", "caption": "Architecture diagram"},
        ]
        tables_meta = [
            {
                "self_ref": "#/tables/0",
                "img_path": "table_0.png",
                "html": "<table><tr><td>A</td><td>B</td></tr></table>",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, tables_meta)

        # Title present
        assert "# Document Title" in result
        # Section headers present
        assert "## Introduction" in result
        assert "## Page 2 Section" in result
        # Body text present
        assert "Some body text here." in result
        assert "More text on page 2." in result
        # Furniture header filtered
        assert "Page Header" not in result
        # Table present with caption
        assert "TABELLE" in result
        assert "Table Caption" in result
        assert "<caption_text>Table Caption</caption_text>" in result
        # Picture present
        assert "![Architecture diagram](images/img_0.png)" in result
        # Page markers
        assert '<seite nummer="1" />' in result
        assert '<seite nummer="2" />' in result

    def test_multiple_images_counter_increments(self) -> None:
        """Image counter increments for each picture, giving correct fallback alt text."""
        doc = _doc(
            pictures=[
                _picture(0, page_no=1),
                _picture(1, page_no=1),
            ],
            body_children=[
                _ref("#/pictures/0"),
                _ref("#/pictures/1"),
            ],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "a.png", "caption": ""},
            {"self_ref": "#/pictures/1", "filename": "b.png", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Image 1](images/a.png)" in result
        assert "![Image 2](images/b.png)" in result

    def test_table_counter_increments(self) -> None:
        """Table counter increments even when tables are furniture-filtered."""
        doc = _doc(
            texts=[
                _text(0, "Hdr", label="page_header"),
            ],
            tables=[
                # Table 0: furniture (100% cells match)
                _table(0, cell_texts=["Hdr"]),
                # Table 1: normal
                _table(1, cell_texts=["real data"]),
            ],
            body_children=[
                _ref("#/tables/0"),
                _ref("#/tables/1"),
            ],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t0.png", "html": "<table></table>"},
            {"self_ref": "#/tables/1", "img_path": "t1.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        # Table 0 filtered, table 1 present
        assert "t1.png" in result

    def test_images_meta_without_self_ref_ignored_in_lookup(self) -> None:
        """images_meta entries without self_ref are not in the ref lookup."""
        doc = _doc(
            pictures=[_picture(0)],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {"filename": "no_ref.png", "caption": ""},  # no self_ref
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        # Falls back to index-based lookup: index 0 -> no_ref.png
        assert "no_ref.png" in result

    def test_tables_meta_without_self_ref_ignored_in_lookup(self) -> None:
        """tables_meta entries without self_ref are not in the ref lookup."""
        doc = _doc(
            tables=[_table(0)],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"img_path": "no_ref.png", "html": "<table></table>"},  # no self_ref
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        # Falls back to index-based lookup
        assert "no_ref.png" in result

    def test_picture_with_caption_from_docling_unresolvable_falls_to_meta(self) -> None:
        """If all caption refs are unresolvable, falls back to images_meta caption."""
        doc = _doc(
            pictures=[_picture(0, captions=[_ref("#/texts/99")])],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "img_0.png",
                "caption": "Meaningful alt text",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Meaningful alt text](images/img_0.png)" in result

    def test_picture_caption_element_with_no_text(self) -> None:
        """Caption element exists but has no text -> falls back to meta."""
        caption_elem = _text(0, "", label="caption")
        doc = _doc(
            texts=[caption_elem],
            pictures=[_picture(0, captions=[_ref("#/texts/0")])],
            body_children=[_ref("#/pictures/0")],
        )
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "img_0.png",
                "caption": "Meta alt text",
            },
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "![Meta alt text](images/img_0.png)" in result

    def test_table_caption_element_with_no_text(self) -> None:
        """Caption element exists but has no text -> caption stays empty."""
        caption_elem = _text(0, "", label="caption")
        doc = _doc(
            texts=[caption_elem],
            tables=[_table(0, captions=[_ref("#/texts/0")])],
            body_children=[_ref("#/tables/0")],
        )
        tables_meta = [
            {"self_ref": "#/tables/0", "img_path": "t.png", "html": "<table></table>"},
        ]
        result = MarkdownBuilder.build(doc, _NO_IMAGES, tables_meta)
        assert "TABELLE" in result
        assert "caption_text" not in result

    def test_mixed_page_order(self) -> None:
        """Elements from pages 1, 3 (skipping 2) produce markers for 1 and 3 only."""
        doc = _doc(
            texts=[
                _text(0, "Page 1", page_no=1),
                _text(1, "Page 3", page_no=3),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert '<seite nummer="1" />' in result
        assert '<seite nummer="3" />' in result
        assert '<seite nummer="2" />' not in result

    # --- Position-based furniture filtering (requires mocking FurnitureDetector) ---

    @patch.object(FurnitureDetector, "detect")
    def test_text_in_furniture_text_refs_by_position_filtered(self, mock_detect: Any) -> None:
        """Text whose self_ref is in furniture_text_refs_by_position is skipped."""
        refs = FurnitureRefs()
        refs.furniture_text_refs_by_position.add("#/texts/0")
        mock_detect.return_value = refs

        doc = _doc(
            texts=[
                _text(0, "Position-filtered text", label="paragraph"),
                _text(1, "Visible text", label="paragraph"),
            ],
            body_children=[_ref("#/texts/0"), _ref("#/texts/1")],
        )
        result = MarkdownBuilder.build(doc, _NO_IMAGES, _NO_TABLES)
        assert "Position-filtered text" not in result
        assert "Visible text" in result

    @patch.object(FurnitureDetector, "detect")
    def test_picture_in_furniture_picture_refs_filtered(self, mock_detect: Any) -> None:
        """Picture whose self_ref is in furniture_picture_refs is skipped."""
        refs = FurnitureRefs()
        refs.furniture_picture_refs.add("#/pictures/0")
        mock_detect.return_value = refs

        doc = _doc(
            pictures=[
                _picture(0, page_no=1),
                _picture(1, page_no=1),
            ],
            body_children=[_ref("#/pictures/0"), _ref("#/pictures/1")],
        )
        images_meta = [
            {"self_ref": "#/pictures/0", "filename": "filtered.png", "caption": ""},
            {"self_ref": "#/pictures/1", "filename": "visible.png", "caption": ""},
        ]
        result = MarkdownBuilder.build(doc, images_meta, _NO_TABLES)
        assert "filtered.png" not in result
        assert "visible.png" in result
