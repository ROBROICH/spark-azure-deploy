# tests/providers/test_docling_modules.py
"""
Tests for docling content_builder and transforms modules.
"""

from typing import Any, cast

# ============================================================================
# 1. src/providers/docling/content_builder.py
# ============================================================================
from src.providers.docling.content_builder import ContentBuilder


def _build(
    doc_json: dict[str, Any], images_meta: list[Any] | None = None, tables_meta: list[Any] | None = None
) -> list[dict[str, Any]]:
    """Helper that wraps ContentBuilder.build_from_json and casts to plain dicts for easy test assertions."""
    raw = ContentBuilder.build_from_json(doc_json, images_meta or [], tables_meta or [])
    return [cast(dict[str, Any], item) for item in raw]


class TestContentBuilder:
    """Tests for ContentBuilder.build_from_json."""

    def test_empty_document(self) -> None:
        """Test that an empty document produces an empty content list."""
        doc_json: dict[str, Any] = {}
        result = _build(doc_json)
        assert result == []

    def test_text_elements(self) -> None:
        """Test that text elements are extracted with correct type, text, and page index."""
        doc_json = {
            "texts": [
                {
                    "text": "Hello world",
                    "label": "paragraph",
                    "prov": [{"page_no": 1, "bbox": {"l": 10, "t": 800, "r": 500, "b": 780}}],
                },
            ],
            "pages": {
                "1": {"size": {"height": 842.0, "width": 595.0}},
            },
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert result[0]["text"] == "Hello world"
        assert result[0]["page_idx"] == 0  # 1-based to 0-based
        assert result[0]["label"] == "paragraph"
        assert "bbox" in result[0]

    def test_furniture_elements_skipped(self) -> None:
        """Test that furniture elements like headers and footers are filtered out."""
        doc_json = {
            "texts": [
                {
                    "text": "Header text",
                    "label": "page_header",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Footer text",
                    "label": "page_footer",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Furniture layer",
                    "label": "text",
                    "content_layer": "furniture",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Alt header",
                    "label": "page-header",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Alt footer",
                    "label": "page-footer",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Kept text",
                    "label": "paragraph",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert result[0]["text"] == "Kept text"

    def test_empty_text_skipped(self) -> None:
        """Test that elements with empty text are skipped."""
        doc_json = {
            "texts": [
                {
                    "text": "",
                    "label": "paragraph",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Valid",
                    "label": "paragraph",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert result[0]["text"] == "Valid"

    def test_section_header_gets_text_level(self) -> None:
        """Test that section headers and titles get text_level=1."""
        doc_json = {
            "texts": [
                {
                    "text": "Section Title",
                    "label": "section_header",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Title",
                    "label": "title",
                    "prov": [{"page_no": 1}],
                },
                {
                    "text": "Alt Section",
                    "label": "section-header",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert all(item.get("text_level") == 1 for item in result)

    def test_no_prov_defaults_page_1(self) -> None:
        """Test that missing provenance defaults to page 1."""
        doc_json = {
            "texts": [
                {
                    "text": "No prov",
                    "label": "paragraph",
                },
            ],
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert result[0]["page_idx"] == 0

    def test_text_no_bbox_has_no_bbox_key(self) -> None:
        """Test that text without bbox in provenance has no bbox key in output."""
        doc_json = {
            "texts": [
                {
                    "text": "No bbox",
                    "label": "paragraph",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert "bbox" not in result[0]

    def test_table_elements(self) -> None:
        """Test that table elements are extracted with HTML body and image path."""
        doc_json = {
            "tables": [
                {
                    "self_ref": "#/tables/0",
                    "prov": [{"page_no": 2, "bbox": {"l": 50, "t": 700, "r": 500, "b": 400}}],
                },
            ],
            "pages": {
                "2": {"size": {"height": 842.0}},
            },
        }
        tables_meta = [
            {
                "self_ref": "#/tables/0",
                "html": "<table><tr><td>cell</td></tr></table>",
                "img_path": "table_0.png",
            }
        ]
        result = _build(doc_json, tables_meta=tables_meta)
        assert len(result) == 1
        assert result[0]["type"] == "table"
        assert result[0]["table_body"] == "<table><tr><td>cell</td></tr></table>"
        assert result[0]["img_path"] == "images/table_0.png"
        assert result[0]["page_idx"] == 1
        assert "bbox" in result[0]

    def test_table_without_meta(self) -> None:
        """Test that a table without metadata gets empty table_body and no img_path."""
        doc_json = {
            "tables": [
                {
                    "self_ref": "#/tables/0",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert result[0]["type"] == "table"
        assert result[0]["table_body"] == ""
        assert "img_path" not in result[0]

    def test_table_no_prov(self) -> None:
        """Test that a table without provenance defaults to page index 0."""
        doc_json = {
            "tables": [
                {
                    "self_ref": "#/tables/0",
                },
            ],
        }
        result = _build(doc_json)
        assert result[0]["page_idx"] == 0

    def test_picture_elements(self) -> None:
        """Test that picture elements are extracted with correct image path and label."""
        doc_json = {
            "pictures": [
                {
                    "self_ref": "#/pictures/0",
                    "label": "figure",
                    "content_layer": "body",
                    "prov": [{"page_no": 3, "bbox": {"l": 0, "t": 500, "r": 400, "b": 200}}],
                },
            ],
            "pages": {
                "3": {"size": {"height": 842.0}},
            },
        }
        images_meta = [
            {
                "self_ref": "#/pictures/0",
                "filename": "picture_0.png",
            }
        ]
        result = _build(doc_json, images_meta=images_meta)
        assert len(result) == 1
        assert result[0]["type"] == "image"
        assert result[0]["img_path"] == "images/picture_0.png"
        assert result[0]["label"] == "figure"
        assert result[0]["content_layer"] == "body"
        assert result[0]["page_idx"] == 2

    def test_picture_without_meta(self) -> None:
        """Test that a picture without metadata has no img_path key."""
        doc_json = {
            "pictures": [
                {
                    "self_ref": "#/pictures/0",
                    "label": "picture",
                    "prov": [{"page_no": 1}],
                },
            ],
        }
        result = _build(doc_json)
        assert len(result) == 1
        assert "img_path" not in result[0]

    def test_sorting_by_page_and_position(self) -> None:
        """Test that content items are sorted by page number and vertical position."""
        doc_json = {
            "texts": [
                {
                    "text": "Page 2 top",
                    "label": "text",
                    "prov": [{"page_no": 2, "bbox": {"l": 0, "t": 800, "r": 100, "b": 780}}],
                },
                {
                    "text": "Page 1 bottom",
                    "label": "text",
                    "prov": [{"page_no": 1, "bbox": {"l": 0, "t": 100, "r": 100, "b": 80}}],
                },
                {
                    "text": "Page 1 top",
                    "label": "text",
                    "prov": [{"page_no": 1, "bbox": {"l": 0, "t": 800, "r": 100, "b": 780}}],
                },
            ],
            "pages": {
                "1": {"size": {"height": 842.0}},
                "2": {"size": {"height": 842.0}},
            },
        }
        result = _build(doc_json)
        assert len(result) == 3
        # Page 1 items should come before page 2
        assert result[0]["page_idx"] == 0
        assert result[1]["page_idx"] == 0
        assert result[2]["page_idx"] == 1

    def test_mixed_content_types(self) -> None:
        """Test that text, table, and image types are all extracted together."""
        doc_json = {
            "texts": [
                {"text": "A paragraph", "label": "paragraph", "prov": [{"page_no": 1}]},
            ],
            "tables": [
                {"self_ref": "#/tables/0", "prov": [{"page_no": 1}]},
            ],
            "pictures": [
                {"self_ref": "#/pictures/0", "label": "figure", "prov": [{"page_no": 1}]},
            ],
        }
        result = _build(doc_json)
        types = {item["type"] for item in result}
        assert types == {"text", "table", "image"}

    def test_default_page_height_used_when_pages_missing(self) -> None:
        """When pages dict is empty, A4 default height (842.0) is used for bbox conversion."""
        doc_json = {
            "texts": [
                {
                    "text": "Text",
                    "label": "paragraph",
                    "prov": [{"page_no": 1, "bbox": {"l": 0, "t": 842, "r": 100, "b": 0}}],
                },
            ],
        }
        result = _build(doc_json)
        # bbox should be converted: y0 = 842 - 842 = 0, y1 = 842 - 0 = 842
        assert result[0]["bbox"] == [0, 0.0, 100, 842.0]

    def test_prov_empty_list_defaults_page_1(self) -> None:
        """Test that an empty provenance list defaults to page index 0."""
        empty_prov: list[dict[str, Any]] = []
        doc_json = {
            "texts": [
                {"text": "No prov entries", "label": "text", "prov": empty_prov},
            ],
        }
        result = _build(doc_json)
        assert result[0]["page_idx"] == 0


# ============================================================================
# 2. src/providers/docling/transforms.py
# ============================================================================

from src.providers.docling.transforms import (  # noqa: E402
    convert_bbox_bottomleft_to_topleft,
    resolve_json_ref,
    sanitize_output_prefix,
)


class TestSanitizeOutputPrefix:
    """Tests for sanitize_output_prefix."""

    def test_normal_string(self) -> None:
        """Test that a normal string passes through unchanged."""
        assert sanitize_output_prefix("document_name") == "document_name"

    def test_unicode_normalization(self) -> None:
        """Test that decomposed Unicode characters are normalized to composed form."""
        # Decomposed U-umlaut -> composed
        decomposed = "U\u0308bersicht"
        result = sanitize_output_prefix(decomposed)
        assert "\u0308" not in result
        assert "\u00dc" in result  # Should be composed

    def test_control_characters_removed(self) -> None:
        """Test that control characters are removed from the output."""
        with_ctrl = "doc\x00name\x01test"
        result = sanitize_output_prefix(with_ctrl)
        assert "\x00" not in result
        assert "\x01" not in result

    def test_line_separators_removed(self) -> None:
        """Test that Unicode line and paragraph separators are removed."""
        with_sep = "doc\u2028name\u2029test"
        result = sanitize_output_prefix(with_sep)
        assert "\u2028" not in result
        assert "\u2029" not in result
        assert result == "docnametest"

    def test_newlines_removed(self) -> None:
        """Test that newlines and carriage returns are removed."""
        with_nl = "line1\nline2\rline3"
        result = sanitize_output_prefix(with_nl)
        assert "\n" not in result
        assert "\r" not in result
        assert result == "line1line2line3"

    def test_special_chars_replaced(self) -> None:
        """Test that filesystem-unsafe special characters are replaced with underscores."""
        special = 'file<name>:path"with|special?chars*'
        result = sanitize_output_prefix(special)
        for char in ["<", ">", ":", '"', "|", "?", "*"]:
            assert char not in result
        assert result == "file_name__path_with_special_chars_"

    def test_spaces_and_tabs_preserved(self) -> None:
        """Test that spaces and tabs are preserved in the output."""
        with_whitespace = "doc name\there"
        result = sanitize_output_prefix(with_whitespace)
        assert result == "doc name\there"

    def test_empty_string(self) -> None:
        """Test that an empty string returns empty."""
        assert sanitize_output_prefix("") == ""

    def test_already_clean_string(self) -> None:
        """Test that an already clean string passes through unchanged."""
        clean = "my_document_2024"
        assert sanitize_output_prefix(clean) == clean

    def test_soft_hyphen_removed(self) -> None:
        """Soft hyphen (U+00AD) is category Cf and should be removed."""
        with_soft_hyphen = "Erlaeu\u00adterungs\u00adbericht"
        result = sanitize_output_prefix(with_soft_hyphen)
        assert "\u00ad" not in result
        assert result == "Erlaeuterungsbericht"


class TestConvertBboxBottomleftToTopleft:
    """Tests for convert_bbox_bottomleft_to_topleft."""

    def test_standard_conversion(self) -> None:
        """Test that bottom-left bbox is correctly converted to top-left coordinates."""
        bbox = {"l": 50.0, "t": 800.0, "r": 500.0, "b": 700.0}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=842.0)
        assert result == [50.0, 842.0 - 800.0, 500.0, 842.0 - 700.0]
        # y0 = 42.0, y1 = 142.0
        assert result == [50.0, 42.0, 500.0, 142.0]

    def test_full_page_bbox(self) -> None:
        """Test that a full-page bbox converts to [0, 0, width, height]."""
        bbox = {"l": 0.0, "t": 842.0, "r": 595.0, "b": 0.0}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=842.0)
        assert result == [0.0, 0.0, 595.0, 842.0]

    def test_missing_keys_default_to_zero(self) -> None:
        """Test that missing bbox keys default to zero."""
        bbox = {"l": 10.0}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=842.0)
        assert result == [10.0, 842.0, 0, 842.0]

    def test_empty_bbox(self) -> None:
        """Test that an empty bbox dict uses all-zero defaults."""
        bbox: dict[str, float] = {}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=842.0)
        assert result == [0, 842.0, 0, 842.0]

    def test_different_page_height(self) -> None:
        """Test that conversion works correctly with a non-A4 page height."""
        bbox = {"l": 0.0, "t": 1000.0, "r": 500.0, "b": 0.0}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=1000.0)
        assert result == [0.0, 0.0, 500.0, 1000.0]

    def test_float_coordinates(self) -> None:
        """Test that float coordinates are preserved in the conversion."""
        bbox = {"l": 10.5, "t": 500.75, "r": 300.25, "b": 100.5}
        result = convert_bbox_bottomleft_to_topleft(bbox, page_height=842.0)
        assert result[0] == 10.5
        assert result[1] == 842.0 - 500.75
        assert result[2] == 300.25
        assert result[3] == 842.0 - 100.5


class TestResolveJsonRef:
    """Tests for resolve_json_ref."""

    def test_string_ref(self) -> None:
        """Test that a string JSON reference resolves to the correct element."""
        doc = {"texts": [{"text": "hello"}, {"text": "world"}]}
        result = resolve_json_ref(doc, "#/texts/1")
        assert result == {"text": "world"}

    def test_dict_ref(self) -> None:
        """Test that a dict with $ref key resolves correctly."""
        doc = {"texts": [{"text": "hello"}]}
        result = resolve_json_ref(doc, {"$ref": "#/texts/0"})
        assert result == {"text": "hello"}

    def test_dict_ref_missing_dollar_ref(self) -> None:
        """Test that a dict without $ref key returns None."""
        doc = {"texts": [{"text": "hello"}]}
        result = resolve_json_ref(doc, {"other": "value"})
        assert result is None

    def test_empty_string_ref(self) -> None:
        """Test that an empty string ref returns None."""
        empty_texts: list[dict[str, Any]] = []
        doc = {"texts": empty_texts}
        result = resolve_json_ref(doc, "")
        assert result is None

    def test_ref_not_starting_with_hash_slash(self) -> None:
        """Test that a ref not starting with #/ returns None."""
        empty_texts: list[dict[str, Any]] = []
        doc = {"texts": empty_texts}
        result = resolve_json_ref(doc, "texts/0")
        assert result is None

    def test_ref_key_not_found(self) -> None:
        """Test that a ref with a nonexistent key returns None."""
        empty_texts: list[dict[str, Any]] = []
        doc = {"texts": empty_texts}
        result = resolve_json_ref(doc, "#/missing/0")
        assert result is None

    def test_ref_index_out_of_range(self) -> None:
        """Test that an out-of-range list index returns None."""
        doc = {"texts": [{"text": "only one"}]}
        result = resolve_json_ref(doc, "#/texts/5")
        assert result is None

    def test_ref_invalid_index(self) -> None:
        """Non-numeric index on a list should return None."""
        doc = {"texts": [{"text": "a"}]}
        result = resolve_json_ref(doc, "#/texts/notanumber")
        assert result is None

    def test_deeply_nested_ref(self) -> None:
        """Test that a deeply nested JSON ref resolves correctly."""
        doc = {"a": {"b": {"c": [{"val": 42}]}}}
        result = resolve_json_ref(doc, "#/a/b/c/0")
        assert result == {"val": 42}

    def test_ref_resolves_to_scalar(self) -> None:
        """Test that a ref resolving to a scalar value returns it directly."""
        doc = {"texts": [{"text": "hello"}]}
        result = resolve_json_ref(doc, "#/texts/0/text")
        assert result == "hello"

    def test_ref_through_non_traversable(self) -> None:
        """If we hit a scalar mid-path, return None."""
        doc = {"texts": "not a dict or list"}
        result = resolve_json_ref(doc, "#/texts/0/deep")
        assert result is None

    def test_none_ref(self) -> None:
        """Test that a None ref returns None."""
        empty_texts: list[dict[str, Any]] = []
        doc = {"texts": empty_texts}
        result = resolve_json_ref(doc, None)
        assert result is None

    def test_hash_only_ref(self) -> None:
        """Test that a ref of '#/' returns None due to empty path segment."""
        empty_texts: list[dict[str, Any]] = []
        doc = {"texts": empty_texts}
        result = resolve_json_ref(doc, "#/")
        # path_parts = [''] -> tries doc[''] which fails
        assert result is None
