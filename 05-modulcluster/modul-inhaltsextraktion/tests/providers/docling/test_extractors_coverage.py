"""Additional coverage tests for ImageExtractor and TableExtractor."""

import base64
from typing import Any

from src.providers.docling.image_extractor import ImageExtractor
from src.providers.docling.table_extractor import TableExtractor

# Minimal valid 1x1 PNG bytes
_TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)
_TINY_PNG_B64 = base64.b64encode(_TINY_PNG_BYTES).decode()
_DATA_URI = f"data:image/png;base64,{_TINY_PNG_B64}"

_EMPTY_CELLS: list[dict[str, Any]] = []


# ── ImageExtractor.extract_from_json ─────────────────────────────────────


class TestImageExtractorExtractFromJson:
    """Tests for ImageExtractor.extract_from_json."""

    def test_extracts_single_image(self) -> None:
        """Test that a single image is extracted with correct metadata and bytes."""
        doc_json = {
            "pictures": [
                {
                    "image": {"uri": _DATA_URI},
                    "prov": [{"page_no": 3, "bbox": {"l": 0, "t": 100, "r": 50, "b": 0}}],
                    "caption": {"text": "Figure 1"},
                    "self_ref": "#/pictures/0",
                }
            ]
        }
        meta, img_bytes = ImageExtractor.extract_from_json(doc_json, "test_doc")

        assert len(meta) == 1
        assert meta[0]["page_no"] == 3
        assert meta[0]["caption"] == "Figure 1"
        assert meta[0]["self_ref"] == "#/pictures/0"
        assert meta[0]["bbox"] == {"l": 0, "t": 100, "r": 50, "b": 0}
        assert meta[0]["filename"] == "test_doc_p3_picture1.png"
        assert meta[0]["index"] == 1
        assert "test_doc_p3_picture1.png" in img_bytes
        assert img_bytes["test_doc_p3_picture1.png"] == _TINY_PNG_BYTES

    def test_skips_non_data_uri(self) -> None:
        """Test that non-data URIs are skipped."""
        doc_json = {"pictures": [{"image": {"uri": "https://example.com/img.png"}, "prov": [{"page_no": 1}]}]}
        meta, img_bytes = ImageExtractor.extract_from_json(doc_json, "test")
        assert len(meta) == 0
        assert len(img_bytes) == 0

    def test_skips_invalid_base64(self) -> None:
        """Test that invalid base64 data URIs are skipped."""
        doc_json = {"pictures": [{"image": {"uri": "data:image/png;base64,!!!invalid!!!"}, "prov": [{"page_no": 1}]}]}
        meta, img_bytes = ImageExtractor.extract_from_json(doc_json, "test")
        assert len(meta) == 0

    def test_missing_provenance(self) -> None:
        """Test that missing provenance defaults to page 1 with no bbox."""
        doc_json = {"pictures": [{"image": {"uri": _DATA_URI}, "prov": list[dict[str, Any]]()}]}
        meta, _ = ImageExtractor.extract_from_json(doc_json, "doc")
        assert len(meta) == 1
        assert meta[0]["page_no"] == 1  # defaults to 1
        assert meta[0]["bbox"] is None

    def test_caption_as_string(self) -> None:
        """Test that a plain string caption is extracted correctly."""
        doc_json = {
            "pictures": [{"image": {"uri": _DATA_URI}, "prov": [{"page_no": 1}], "caption": "plain text caption"}]
        }
        meta, _ = ImageExtractor.extract_from_json(doc_json, "doc")
        assert meta[0]["caption"] == "plain text caption"

    def test_no_caption(self) -> None:
        """Test that missing caption defaults to empty string."""
        doc_json = {"pictures": [{"image": {"uri": _DATA_URI}, "prov": [{"page_no": 1}]}]}
        meta, _ = ImageExtractor.extract_from_json(doc_json, "doc")
        assert meta[0]["caption"] == ""

    def test_no_image_data(self) -> None:
        """Test that a picture with no image data is skipped."""
        picture_entry: dict[str, Any] = {"image": None, "prov": [{"page_no": 1}]}
        doc_json = {"pictures": [picture_entry]}
        meta, _ = ImageExtractor.extract_from_json(doc_json, "doc")
        assert len(meta) == 0

    def test_empty_pictures_list(self) -> None:
        """Test that an empty pictures list returns empty results."""
        empty_doc: dict[str, Any] = {"pictures": []}
        meta, img_bytes = ImageExtractor.extract_from_json(empty_doc, "doc")
        assert len(meta) == 0
        assert len(img_bytes) == 0

    def test_multiple_pictures(self) -> None:
        """Test that multiple pictures are extracted with sequential indices."""
        doc_json = {
            "pictures": [
                {"image": {"uri": _DATA_URI}, "prov": [{"page_no": 1}]},
                {"image": {"uri": _DATA_URI}, "prov": [{"page_no": 2}]},
            ]
        }
        meta, img_bytes = ImageExtractor.extract_from_json(doc_json, "doc")
        assert len(meta) == 2
        assert meta[0]["index"] == 1
        assert meta[1]["index"] == 2
        assert len(img_bytes) == 2


# ── ImageExtractor.extract_from_markdown ─────────────────────────────────


class TestImageExtractorExtractFromMarkdown:
    """Tests for ImageExtractor.extract_from_markdown."""

    def test_extracts_images_from_markdown(self) -> None:
        """Test that base64 images in markdown are extracted with correct metadata."""
        md = f"Some text\n![Alt text](data:image/png;base64,{_TINY_PNG_B64})\nMore text"
        doc_json = {
            "pictures": [
                {
                    "prov": [{"page_no": 5, "bbox": {"l": 0, "t": 100, "r": 50, "b": 0}}],
                    "self_ref": "#/pictures/0",
                }
            ]
        }
        meta, img_bytes = ImageExtractor.extract_from_markdown(md, doc_json, "test_doc")

        assert len(meta) == 1
        assert meta[0]["page_no"] == 5
        assert meta[0]["caption"] == "Alt text"
        assert meta[0]["self_ref"] == "#/pictures/0"
        assert meta[0]["bbox"] == {"l": 0, "t": 100, "r": 50, "b": 0}
        assert "test_doc_p5_picture1.png" in img_bytes

    def test_no_matching_picture_in_json(self) -> None:
        """Test that markdown images without matching JSON pictures use defaults."""
        md = f"![](data:image/png;base64,{_TINY_PNG_B64})"
        doc_json: dict[str, Any] = {"pictures": []}
        meta, img_bytes = ImageExtractor.extract_from_markdown(md, doc_json, "doc")

        assert len(meta) == 1
        assert meta[0]["page_no"] == 1  # default
        assert meta[0]["self_ref"] == "#/pictures/0"
        assert meta[0]["caption"] == ""

    def test_no_images_in_markdown(self) -> None:
        """Test that plain text markdown returns empty results."""
        md = "Just plain text, no images here."
        empty_doc: dict[str, Any] = {"pictures": []}
        meta, img_bytes = ImageExtractor.extract_from_markdown(md, empty_doc, "doc")
        assert len(meta) == 0
        assert len(img_bytes) == 0

    def test_invalid_base64_in_markdown(self) -> None:
        """Test that invalid base64 in markdown images is skipped."""
        md = "![alt](data:image/png;base64,!!!BAD!!!)"
        empty_doc: dict[str, Any] = {"pictures": []}
        meta, _ = ImageExtractor.extract_from_markdown(md, empty_doc, "doc")
        assert len(meta) == 0

    def test_multiple_images_in_markdown(self) -> None:
        """Test that multiple markdown images are all extracted with correct captions."""
        md = f"![A](data:image/png;base64,{_TINY_PNG_B64})\n![B](data:image/png;base64,{_TINY_PNG_B64})"
        doc_json = {
            "pictures": [
                {"prov": [{"page_no": 1}], "self_ref": "#/pictures/0"},
                {"prov": [{"page_no": 2}], "self_ref": "#/pictures/1"},
            ]
        }
        meta, img_bytes = ImageExtractor.extract_from_markdown(md, doc_json, "doc")
        assert len(meta) == 2
        assert meta[0]["caption"] == "A"
        assert meta[1]["caption"] == "B"


# ── TableExtractor.extract_from_json ─────────────────────────────────────


class TestTableExtractorExtractFromJson:
    """Tests for TableExtractor.extract_from_json."""

    def test_extracts_single_table(self) -> None:
        """Test that a single table is extracted with correct HTML and metadata."""
        doc_json = {
            "tables": [
                {
                    "prov": [{"page_no": 2, "bbox": {"l": 10, "t": 200, "r": 300, "b": 50}}],
                    "data": {
                        "num_rows": 2,
                        "num_cols": 2,
                        "table_cells": [
                            {
                                "start_row_offset_idx": 0,
                                "start_col_offset_idx": 0,
                                "text": "A",
                                "row_span": 1,
                                "col_span": 1,
                            },
                            {
                                "start_row_offset_idx": 0,
                                "start_col_offset_idx": 1,
                                "text": "B",
                                "row_span": 1,
                                "col_span": 1,
                            },
                            {
                                "start_row_offset_idx": 1,
                                "start_col_offset_idx": 0,
                                "text": "C",
                                "row_span": 1,
                                "col_span": 1,
                            },
                            {
                                "start_row_offset_idx": 1,
                                "start_col_offset_idx": 1,
                                "text": "D",
                                "row_span": 1,
                                "col_span": 1,
                            },
                        ],
                    },
                    "self_ref": "#/tables/0",
                }
            ]
        }
        images_bytes: dict[str, bytes] = {}
        meta = TableExtractor.extract_from_json(doc_json, "test_doc", images_bytes)

        assert len(meta) == 1
        assert meta[0]["page_no"] == 2
        assert meta[0]["index"] == 1
        assert meta[0]["rows"] == 2
        assert meta[0]["cols"] == 2
        assert meta[0]["self_ref"] == "#/tables/0"
        assert "<table>" in meta[0]["html"]
        assert "A" in meta[0]["html"]

    def test_table_with_embedded_image(self) -> None:
        """Test that a table with an embedded image extracts the image bytes."""
        doc_json = {
            "tables": [
                {
                    "prov": [{"page_no": 1}],
                    "data": {"num_rows": 1, "num_cols": 1, "table_cells": list[dict[str, Any]]()},
                    "image": {"uri": _DATA_URI},
                }
            ]
        }
        images_bytes: dict[str, bytes] = {}
        meta = TableExtractor.extract_from_json(doc_json, "doc", images_bytes)

        assert meta[0]["img_path"] == "doc_p1_table1.png"
        assert "doc_p1_table1.png" in images_bytes

    def test_table_without_image(self) -> None:
        """Test that a table without an image has None img_path."""
        doc_json = {
            "tables": [
                {
                    "prov": [{"page_no": 1}],
                    "data": {"num_rows": 1, "num_cols": 1, "table_cells": list[dict[str, Any]]()},
                }
            ]
        }
        images_bytes: dict[str, bytes] = {}
        meta = TableExtractor.extract_from_json(doc_json, "doc", images_bytes)
        assert meta[0]["img_path"] is None
        assert len(images_bytes) == 0

    def test_missing_provenance(self) -> None:
        """Test that a table without provenance defaults to page 1."""
        doc_json = {
            "tables": [
                {
                    "prov": list[dict[str, Any]](),
                    "data": {"num_rows": 0, "num_cols": 0, "table_cells": list[dict[str, Any]]()},
                }
            ]
        }
        empty_bytes: dict[str, bytes] = {}
        meta = TableExtractor.extract_from_json(doc_json, "doc", empty_bytes)
        assert meta[0]["page_no"] == 1
        assert meta[0]["bbox"] is None

    def test_empty_tables_list(self) -> None:
        """Test that an empty tables list returns empty results."""
        empty_bytes: dict[str, bytes] = {}
        meta = TableExtractor.extract_from_json({"tables": []}, "doc", empty_bytes)
        assert len(meta) == 0


# ── TableExtractor.build_html ────────────────────────────────────────────


class TestTableExtractorBuildHtml:
    """Tests for TableExtractor.build_html."""

    def test_empty_table(self) -> None:
        """Test that an empty table produces bare table tags."""
        table = {"data": {"num_rows": 0, "num_cols": 0, "table_cells": list[dict[str, Any]]()}}
        html = TableExtractor.build_html(table)
        assert html == "<table></table>"

    def test_simple_2x2_table(self) -> None:
        """Test that a 2x2 table renders headers and data cells correctly."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 2,
                "table_cells": [
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 0,
                        "text": "H1",
                        "row_span": 1,
                        "col_span": 1,
                        "column_header": True,
                    },
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 1,
                        "text": "H2",
                        "row_span": 1,
                        "col_span": 1,
                        "column_header": True,
                    },
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "text": "V1", "row_span": 1, "col_span": 1},
                    {"start_row_offset_idx": 1, "start_col_offset_idx": 1, "text": "V2", "row_span": 1, "col_span": 1},
                ],
            }
        }
        html = TableExtractor.build_html(table)
        assert "<th>H1</th>" in html
        assert "<th>H2</th>" in html
        assert "<td>V1</td>" in html
        assert "<td>V2</td>" in html

    def test_colspan(self) -> None:
        """Test that colspan attribute is rendered in HTML output."""
        table = {
            "data": {
                "num_rows": 1,
                "num_cols": 2,
                "table_cells": [
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 0,
                        "text": "Merged",
                        "row_span": 1,
                        "col_span": 2,
                    },
                ],
            }
        }
        html = TableExtractor.build_html(table)
        assert 'colspan="2"' in html

    def test_rowspan(self) -> None:
        """Test that rowspan attribute is rendered in HTML output."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 1,
                "table_cells": [
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 0,
                        "text": "Tall",
                        "row_span": 2,
                        "col_span": 1,
                    },
                ],
            }
        }
        html = TableExtractor.build_html(table)
        assert 'rowspan="2"' in html

    def test_html_escaping(self) -> None:
        """Test that cell text is HTML-escaped in the output."""
        table = {
            "data": {
                "num_rows": 1,
                "num_cols": 1,
                "table_cells": [
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 0,
                        "text": "<b>bold & stuff</b>",
                        "row_span": 1,
                        "col_span": 1,
                    },
                ],
            }
        }
        html = TableExtractor.build_html(table)
        assert "&lt;b&gt;bold &amp; stuff&lt;/b&gt;" in html

    def test_empty_cell_in_grid(self) -> None:
        """When a cell position has no data (None in grid), it should render as <td></td>."""
        table = {
            "data": {
                "num_rows": 1,
                "num_cols": 2,
                "table_cells": [
                    {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "text": "A", "row_span": 1, "col_span": 1},
                    # col 1 is not populated → None in grid
                ],
            }
        }
        html = TableExtractor.build_html(table)
        assert "<td></td>" in html

    def test_no_cells_returns_empty_table(self) -> None:
        """When table_cells is empty, build_html returns <table></table>."""
        table = {"data": {"num_rows": 0, "num_cols": 0, "table_cells": list[dict[str, Any]]()}}
        html = TableExtractor.build_html(table)
        assert html == "<table></table>"

    def test_sparse_grid_with_null_cells(self) -> None:
        """Grid positions not covered by any cell render as <td></td>."""
        table = {
            "data": {
                "num_rows": 2,
                "num_cols": 2,
                "table_cells": [
                    {
                        "start_row_offset_idx": 0,
                        "start_col_offset_idx": 0,
                        "text": "Only",
                        "row_span": 1,
                        "col_span": 1,
                    },
                ],
            }
        }
        html = TableExtractor.build_html(table)
        # 3 of 4 cells have no data → <td></td>
        assert html.count("<td></td>") == 3
        assert "Only" in html
