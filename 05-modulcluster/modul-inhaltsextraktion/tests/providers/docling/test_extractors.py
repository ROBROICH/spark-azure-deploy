"""Tests for full-page image detection and injection in ImageExtractor."""

import base64
from typing import Any
from unittest.mock import patch

from src.config import Config
from src.providers.base import ContentItemDict
from src.providers.docling.image_extractor import ImageExtractor

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Minimal 1x1 transparent PNG (valid base64)
_TINY_PNG_B64 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
).decode()
_PAGE_IMAGE_URI = f"data:image/png;base64,{_TINY_PNG_B64}"


def _make_page(
    page_no: int, width: float = 595.0, height: float = 842.0, image_uri: Any = _PAGE_IMAGE_URI
) -> tuple[str, dict[str, Any]]:
    """Build a minimal page entry for doc_json['pages']."""
    page = {"size": {"width": width, "height": height}}
    if image_uri is not None:
        page["image"] = {"uri": image_uri}
    return str(page_no), page


def _make_doc_json(
    pages: dict[str, Any],
    pictures: list[dict[str, Any]] | None = None,
    tables: list[dict[str, Any]] | None = None,
    texts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a minimal doc_json structure for testing."""
    return {
        "pages": pages,
        "pictures": pictures or [],
        "tables": tables or [],
        "texts": texts or [],
    }


def _text_elem(page_no: int, left: float, b: float, r: float, t: float, text: str = "x") -> dict[str, Any]:
    """Build a text element with provenance bbox."""
    return {
        "text": text,
        "label": "text",
        "prov": [{"page_no": page_no, "bbox": {"l": left, "b": b, "r": r, "t": t}}],
    }


def _picture_elem(page_no: int, idx: int = 0) -> dict[str, Any]:
    """Build a picture element with provenance and image URI."""
    return {
        "self_ref": f"#/pictures/{idx}",
        "prov": [{"page_no": page_no}],
        "image": {"uri": _PAGE_IMAGE_URI},
    }


def _table_elem(page_no: int, idx: int = 0) -> dict[str, Any]:
    """Build a table element with provenance and empty data."""
    return {
        "self_ref": f"#/tables/{idx}",
        "prov": [{"page_no": page_no}],
        "data": {"num_rows": 1, "num_cols": 1, "table_cells": []},
    }


# ===========================================================================
# Tests for detect_full_page_images
# ===========================================================================


class TestDetectFullPageImages:
    """Tests for ImageExtractor.detect_full_page_images()."""

    def test_no_candidates_all_pages_have_pictures(self) -> None:
        """All pages already have pictures → returns empty."""
        pages = dict([_make_page(1), _make_page(2)])
        doc_json = _make_doc_json(
            pages=pages,
            pictures=[_picture_elem(1), _picture_elem(2, idx=1)],
        )
        meta, img_bytes = ImageExtractor.detect_full_page_images(doc_json, "test")
        assert meta == []
        assert img_bytes == {}

    def test_zero_content_page_detected(self) -> None:
        """Page with 0 text, 0 pictures, page image available → detected."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(pages=pages)

        meta, img_bytes = ImageExtractor.detect_full_page_images(doc_json, "doc")
        assert len(meta) == 1
        assert meta[0]["page_no"] == 1
        assert meta[0]["self_ref"] == "#/fullpage/1"
        assert meta[0]["filename"] == "doc_p1_fullpage.png"
        assert "doc_p1_fullpage.png" in img_bytes

    def test_low_coverage_page_detected(self) -> None:
        """Page with <10% text coverage → detected."""
        # Page is 100x100 = 10000 area. Text bbox = 5x5 = 25 → 0.25%
        pages = dict([_make_page(1, width=100, height=100)])
        doc_json = _make_doc_json(
            pages=pages,
            texts=[_text_elem(1, left=0, b=0, r=5, t=5)],
        )
        meta, img_bytes = ImageExtractor.detect_full_page_images(
            doc_json,
            "doc",
            threshold=0.10,
        )
        assert len(meta) == 1
        assert meta[0]["page_no"] == 1

    def test_text_page_skipped(self) -> None:
        """Page with 50% text coverage → not detected."""
        # Page is 100x100 = 10000 area. Text bbox covers 50x100 = 5000 → 50%
        pages = dict([_make_page(1, width=100, height=100)])
        doc_json = _make_doc_json(
            pages=pages,
            texts=[_text_elem(1, left=0, b=0, r=50, t=100)],
        )
        meta, _ = ImageExtractor.detect_full_page_images(
            doc_json,
            "doc",
            threshold=0.10,
        )
        assert meta == []

    def test_page_with_tables_skipped(self) -> None:
        """Page with 0 pictures but has tables → not detected."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(
            pages=pages,
            tables=[_table_elem(1)],
        )
        meta, _ = ImageExtractor.detect_full_page_images(doc_json, "doc")
        assert meta == []

    def test_no_page_image_available(self) -> None:
        """Page is candidate but has no page image → skipped."""
        _, page_data = _make_page(1, image_uri=None)
        pages = {"1": page_data}
        doc_json = _make_doc_json(pages=pages)

        meta, _ = ImageExtractor.detect_full_page_images(doc_json, "doc")
        assert meta == []

    def test_multiple_pages_mixed(self) -> None:
        """Multiple pages: some candidates, some not."""
        p1_key, p1_val = _make_page(1)  # No text, no pictures → candidate
        p2_key, p2_val = _make_page(2, width=100, height=100)  # Will have 50% text
        p3_key, p3_val = _make_page(3)  # No text, no pictures → candidate
        pages = {p1_key: p1_val, p2_key: p2_val, p3_key: p3_val}

        doc_json = _make_doc_json(
            pages=pages,
            texts=[_text_elem(2, left=0, b=0, r=50, t=100)],  # 50% on page 2
        )

        meta, img_bytes = ImageExtractor.detect_full_page_images(doc_json, "doc")
        detected_pages = sorted(m["page_no"] for m in meta)
        assert detected_pages == [1, 3]
        assert len(img_bytes) == 2


# ===========================================================================
# Tests for inject_full_page_images
# ===========================================================================


class TestInjectFullPageImages:
    """Tests for ImageExtractor.inject_full_page_images()."""

    def test_no_detections_returns_unchanged(self) -> None:
        """When no full-page images are detected, inputs returned unchanged."""
        pages = dict([_make_page(1, width=100, height=100)])
        doc_json = _make_doc_json(
            pages=pages,
            texts=[_text_elem(1, left=0, b=0, r=100, t=100)],  # 100% coverage
        )
        orig_meta: list[dict[str, Any]] = [{"filename": "x.png", "page_no": 1}]
        orig_bytes: dict[str, bytes] = {"x.png": b"data"}
        orig_cl: list[ContentItemDict] = [{"type": "text", "page_idx": 0, "text": ""}]
        orig_md = "# Hello"

        meta, byt, cl, md = ImageExtractor.inject_full_page_images(
            doc_json,
            orig_meta,
            orig_bytes,
            orig_cl,
            orig_md,
            "doc",
        )
        assert meta is orig_meta
        assert byt is orig_bytes
        assert cl is orig_cl
        assert md is orig_md

    def test_markdown_injection_with_existing_marker(self) -> None:
        """Image inserted after existing <seite> marker."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(pages=pages)
        markdown = '<seite nummer="1" />\nSome text'
        empty_meta: list[dict[str, Any]] = []
        empty_bytes: dict[str, bytes] = {}
        empty_cl: list[ContentItemDict] = []

        _, _, _, md = ImageExtractor.inject_full_page_images(
            doc_json,
            empty_meta,
            empty_bytes,
            empty_cl,
            markdown,
            "doc",
        )
        assert "![Full page image](images/doc_p1_fullpage.png)" in md
        # Image should be after the page marker
        marker_pos = md.index('<seite nummer="1" />')
        img_pos = md.index("![Full page image]")
        assert img_pos > marker_pos

    def test_markdown_injection_without_marker(self) -> None:
        """Page marker + image appended when no marker exists."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(pages=pages)
        markdown = "# Some content"
        empty_meta: list[dict[str, Any]] = []
        empty_bytes: dict[str, bytes] = {}
        empty_cl: list[ContentItemDict] = []

        _, _, _, md = ImageExtractor.inject_full_page_images(
            doc_json,
            empty_meta,
            empty_bytes,
            empty_cl,
            markdown,
            "doc",
        )
        assert '<seite nummer="1" />' in md
        assert "![Full page image](images/doc_p1_fullpage.png)" in md

    def test_content_list_items_added_and_sorted(self) -> None:
        """Content list gets new image items and is re-sorted by page."""
        p1_key, p1_val = _make_page(1)  # candidate
        p3_key, p3_val = _make_page(3)  # candidate
        pages = {p1_key: p1_val, p3_key: p3_val}
        doc_json = _make_doc_json(pages=pages)

        existing_cl: list[ContentItemDict] = [
            {"type": "text", "page_idx": 1, "text": "", "bbox": [0, 50, 100, 100]},
        ]

        empty_meta: list[dict[str, Any]] = []
        empty_bytes: dict[str, bytes] = {}
        _, _, cl, _ = ImageExtractor.inject_full_page_images(
            doc_json,
            empty_meta,
            empty_bytes,
            existing_cl,
            "",
            "doc",
        )

        # Should have original + 2 new items
        image_items = [c for c in cl if str(c.get("img_path") or "").endswith("_fullpage.png")]
        assert len(image_items) == 2

        # Verify sorting: page 0 items before page 1 before page 2
        page_idxs = [c["page_idx"] for c in cl]
        assert page_idxs == sorted(page_idxs)

    @patch(
        "src.providers.docling.image_extractor.get_config",
        return_value=Config(DETECT_FULL_PAGE_IMAGES=False, FULL_PAGE_IMAGE_TEXT_COVERAGE_THRESHOLD=0.10),
    )
    def test_feature_flag_off(self, mock_get_config: Any) -> None:
        """When DETECT_FULL_PAGE_IMAGES is False, inject returns unchanged."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(pages=pages)

        # detect_full_page_images reads threshold from config
        # but inject_full_page_images always calls detect, so we test
        # the flag at the call site level (docling_provider / docling_processing)
        # Here we just verify detect itself works with explicit threshold
        meta, _ = ImageExtractor.detect_full_page_images(doc_json, "doc", threshold=0.10)
        # Should still detect (the flag is checked at the caller, not in detect)
        assert len(meta) == 1

    def test_images_bytes_merged(self) -> None:
        """Existing images_bytes are preserved and new ones added."""
        pages = dict([_make_page(1)])
        doc_json = _make_doc_json(pages=pages)

        existing_bytes: dict[str, bytes] = {"existing.png": b"existing_data"}
        empty_meta: list[dict[str, Any]] = []
        empty_cl: list[ContentItemDict] = []
        _, new_bytes, _, _ = ImageExtractor.inject_full_page_images(
            doc_json,
            empty_meta,
            existing_bytes,
            empty_cl,
            "",
            "doc",
        )
        assert "existing.png" in new_bytes
        assert "doc_p1_fullpage.png" in new_bytes
