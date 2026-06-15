"""Furniture (header/footer) detection for docling document elements."""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

__all__ = ["FurnitureDetector", "FurnitureRefs"]


@dataclass
class FurnitureRefs:
    """
    Container for element references that should be filtered as furniture (headers/footers).

    Used by MarkdownBuilder to skip recurring header/footer elements.
    """

    # Text refs that have picture parents (OCR'd text from images)
    texts_with_picture_parent: set[str] = field(default_factory=set)
    # Table refs that are in furniture regions or contain furniture content
    furniture_table_refs: set[str] = field(default_factory=set)
    # Picture refs that are in header/footer regions (except first occurrence)
    furniture_picture_refs: set[str] = field(default_factory=set)
    # Text refs that are in header/footer regions by position
    furniture_text_refs_by_position: set[str] = field(default_factory=set)
    # Text content marked as furniture (for content-based table matching)
    furniture_texts: set[str] = field(default_factory=set)
    # Labels that indicate furniture elements
    furniture_labels: set[str] = field(
        default_factory=lambda: {
            "page_footer",
            "page_header",
            "page-footer",
            "page-header",
        }
    )


class FurnitureDetector:
    """Detects header/footer elements for filtering."""

    @staticmethod
    def detect(doc_json: dict[str, Any]) -> FurnitureRefs:
        """
        Detect header/footer elements that should be filtered from the output.

        Uses label-based and content-based strategies only (no position-based filtering).
        Position-based filtering was removed because it incorrectly filtered content
        that starts at the top of the page (e.g., full-page images, large tables).

        Filtering strategies:
        1. Label-based: Elements marked as furniture by Docling (content_layer or label)
        2. Content-based: Tables containing >50% furniture text in cells
        3. Parent-based: Text OCR'd from within pictures (children of picture elements)

        Note: Position-based recurring element detection is handled separately by
        filter.py using perceptual hashing and other techniques.

        Args:
            doc_json: Document JSON from doc.export_to_dict()

        Returns:
            FurnitureRefs containing sets of refs to filter
        """
        refs = FurnitureRefs()

        # --- Step 1: Find texts with picture parents (OCR'd text from images) ---
        # These are text elements extracted via OCR from within pictures.
        # We skip them because the picture itself will be processed by VLM.
        for txt in doc_json.get("texts", []):
            parent = txt.get("parent", {})
            parent_ref = parent.get("$ref", "") if isinstance(parent, dict) else ""
            if "/pictures/" in parent_ref:
                self_ref = txt.get("self_ref", "")
                refs.texts_with_picture_parent.add(self_ref)
                logger.debug(f"Text {self_ref} has picture parent {parent_ref}, will be skipped")

        if refs.texts_with_picture_parent:
            logger.info(
                f"Found {len(refs.texts_with_picture_parent)} text elements with picture parents (will be skipped)"
            )

        # --- Step 2: Collect furniture text content for content-based matching ---
        # Identify text marked as furniture by Docling's classification
        for txt in doc_json.get("texts", []):
            content_layer = txt.get("content_layer", "").lower()
            label = txt.get("label", "").lower()
            if content_layer == "furniture" or label in refs.furniture_labels:
                text = txt.get("text", "").strip()
                if text:
                    refs.furniture_texts.add(text)

        if refs.furniture_texts:
            logger.debug(f"Collected {len(refs.furniture_texts)} furniture text snippets")

        # --- Step 3: Detect furniture tables (content-based only) ---
        # Tables where >50% of cells contain text matching known furniture content
        for tbl in doc_json.get("tables", []):
            table_ref = tbl.get("self_ref", "")
            table_data = tbl.get("data", {})
            table_cells = table_data.get("table_cells", [])

            # Content-based matching: filter if >50% cells match furniture text
            if not table_cells or not refs.furniture_texts:
                continue
            cell_texts = [cell.get("text", "").strip() for cell in table_cells if cell.get("text", "").strip()]
            if not cell_texts:
                continue
            matching_cells = sum(1 for ct in cell_texts if any(ct in ft for ft in refs.furniture_texts))
            match_ratio = matching_cells / len(cell_texts)
            if match_ratio > 0.5:
                refs.furniture_table_refs.add(table_ref)
                logger.debug(f"Table {table_ref} has {match_ratio:.0%} cells matching furniture content")

        if refs.furniture_table_refs:
            logger.info(f"Found {len(refs.furniture_table_refs)} tables with furniture content (will be skipped)")

        # Note: Position-based filtering for pictures and text was removed.
        # It incorrectly filtered full-page images and tables that start at the top.
        # Recurring header/footer detection is handled by filter.py instead.

        return refs
