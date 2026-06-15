"""Filters recurring elements like headers and footers from the document content."""

import io
import re
from collections import defaultdict
from typing import Any

import imagehash
from PIL import Image

from src.processors.filter_utils import (
    _assign_hash_group,
    _collect_furniture_assets,
    _get_logger,
)
from src.processors.filtering_config import (
    FOOTER_ZONE_RATIO,
    FURNITURE_LABELS,
    HEADER_ZONE_RATIO,
    IMAGE_HASH_SIZE,
)
from src.providers.base import ContentItemDict
from src.utils.pil_lock import _pil_lock

__all__ = ["HeaderFooterFilter"]


class HeaderFooterFilter:
    """
    Filters recurring table, image, and text elements that are likely headers or footers.
    """

    @staticmethod
    def _is_in_header_or_footer(bbox: list[float], header_zone_end: float, footer_zone_start: float) -> bool:
        """Checks if a bounding box is within the header or footer zone."""
        y1, y2 = bbox[1], bbox[3]
        is_in_header = y2 < header_zone_end
        is_in_footer = y1 > footer_zone_start
        return is_in_header or is_in_footer

    @staticmethod
    def _get_normalized_text(text: str) -> str:
        """Normalizes text by removing all digits to catch recurring text with page numbers."""
        return re.sub(r"\d+", "", text)

    @staticmethod
    def filter_by_provider_labels(
        content_list: list[ContentItemDict],
    ) -> tuple[list[ContentItemDict], set[str], set[str], set[str]]:
        """
        Filter elements based on provider labels (e.g., Docling's page_header/page_footer).

        This is more reliable than bbox-based detection for providers that properly
        identify headers/footers during OCR. Removes ALL elements with furniture labels,
        not just recurring ones.

        Args:
            content_list: The list of content elements with 'label' field.

        Returns:
            Tuple containing:
                - A new content list with header/footer elements removed.
                - A set of image filenames that were filtered out.
                - A set of raw HTML table bodies that were filtered out.
                - A set of text content that was filtered out.
        """
        indices_to_filter = set()
        images_to_filter = set()
        html_tables_to_filter = set()
        text_to_filter = set()

        for i, element in enumerate(content_list):
            label = element.get("label", "")
            content_layer = element.get("content_layer", "")

            # Check both label and content_layer for furniture markers (case-insensitive)
            label_lower = str(label).lower() if label else ""
            content_layer_lower = str(content_layer).lower() if content_layer else ""
            is_furniture = (
                label_lower in {lbl.lower() for lbl in FURNITURE_LABELS} or content_layer_lower == "furniture"
            )

            if is_furniture:
                indices_to_filter.add(i)
                _collect_furniture_assets(element, images_to_filter, html_tables_to_filter, text_to_filter)

        logger = _get_logger()
        if indices_to_filter:
            logger.info(
                f"Label-based filtering: removing {len(indices_to_filter)} header/footer elements "
                f"({len(images_to_filter)} images, {len(html_tables_to_filter)} tables, "
                f"{len(text_to_filter)} text blocks)"
            )
        else:
            logger.info(f"Label-based filtering: no furniture elements found in {len(content_list)} content items")

        filtered_content_list = [elem for i, elem in enumerate(content_list) if i not in indices_to_filter]

        return (
            filtered_content_list,
            images_to_filter,
            html_tables_to_filter,
            text_to_filter,
        )

    @staticmethod
    def find_duplicate_images(
        content_list: list[ContentItemDict],
        image_bytes: dict[str, bytes],
    ) -> set[str]:
        """
        Find duplicate images using perceptual hashing.

        Scans all image and table elements with img_path, computes perceptual hashes,
        groups similar images, and returns the img_paths of duplicates (keeps first occurrence).

        This is a standalone function intended for use in the extraction activity where
        image bytes are already in memory, avoiding DMS round-trips for deduplication.

        Args:
            content_list: The list of content elements from extraction provider.
            image_bytes: A dictionary mapping image filenames to their byte content.

        Returns:
            Set of img_path values to remove (duplicates; the first occurrence is kept).
        """
        logger = _get_logger()

        # Collect all image/table elements that have an img_path
        all_images: list[dict[str, Any]] = []
        for i, element in enumerate(content_list):
            elem_type = element.get("type")
            if elem_type in ["image", "img", "table"] and element.get("img_path"):
                all_images.append({"index": i, "element": element})

        if not all_images:
            logger.info("find_duplicate_images: no images to deduplicate")
            return set()

        # Compute perceptual hashes and group similar images
        image_hashes: dict[imagehash.ImageHash, list[int]] = {}

        processed_count = 0
        for item in all_images:
            element = item["element"]
            index = item["index"]
            img_ref = element.get("img_path")
            if not img_ref:
                continue

            img_key = img_ref.replace("images/", "") if img_ref.startswith("images/") else img_ref
            img_data = image_bytes.get(img_key) or image_bytes.get(img_ref)

            if not img_data:
                logger.debug(f"find_duplicate_images: bytes not found for {img_ref}")
                continue

            try:
                with _pil_lock, Image.open(io.BytesIO(img_data)) as img:
                    img_hash = imagehash.phash(img, hash_size=IMAGE_HASH_SIZE)
                _assign_hash_group(image_hashes, img_hash, index)
                processed_count += 1
            except Exception as e:
                logger.warning(f"find_duplicate_images: could not process {img_ref}: {e}")

        logger.info(
            f"find_duplicate_images: hashed {processed_count}/{len(all_images)} images into {len(image_hashes)} groups"
        )

        # Identify duplicates: for each group with 2+ members, keep the first, mark rest as duplicates
        duplicate_img_paths: set[str] = set()
        for _img_hash, indices in image_hashes.items():
            if len(indices) < 2:
                continue

            sorted_indices = sorted(
                indices,
                key=lambda i: (
                    content_list[i].get("page_idx", 0),
                    content_list[i].get("bbox", [0, 0, 0, 0])[1],
                ),
            )

            img_paths = [content_list[i].get("img_path", "?") for i in sorted_indices]
            logger.info(
                f"find_duplicate_images: {len(sorted_indices)} similar images "
                f"(will remove {len(sorted_indices) - 1}): {img_paths}"
            )

            for i in sorted_indices[1:]:
                img_path = content_list[i].get("img_path")
                if img_path:
                    duplicate_img_paths.add(str(img_path))

        return duplicate_img_paths

    @staticmethod
    def _collect_candidate_elements(
        content_list: list[ContentItemDict],
        header_zone_end: float,
        footer_zone_start: float,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Collect position-based candidates and all images for recurring element detection."""
        potential_elements: list[dict[str, Any]] = []
        all_images: list[dict[str, Any]] = []

        for i, element in enumerate(content_list):
            elem_type = element.get("type")

            if elem_type in ["image", "img", "table"] and element.get("img_path"):
                all_images.append({"index": i, "element": element})

            bbox = element.get("bbox")
            if elem_type in ["table", "image", "img", "text"] and bbox is not None:
                if HeaderFooterFilter._is_in_header_or_footer(bbox, header_zone_end, footer_zone_start):
                    potential_elements.append({"index": i, "element": element})

        return potential_elements, all_images

    @staticmethod
    def _identify_recurring_groups(
        all_groups: list[list[int]],
        occurrence_threshold: int,
        content_list: list[ContentItemDict],
    ) -> set[int]:
        """From grouped signature indices, identify which indices to filter (keep first per group)."""
        logger = _get_logger()
        indices_to_filter: set[int] = set()

        for group_indices in all_groups:
            if len(group_indices) < occurrence_threshold:
                continue

            try:
                sorted_group = sorted(
                    group_indices,
                    key=lambda i: (
                        content_list[i].get("page_idx", 0),
                        content_list[i].get("bbox", [0, 0, 0, 0])[1],
                    ),
                )
            except (KeyError, IndexError, TypeError) as e:
                logger.warning(f"Error sorting group indices {group_indices}: {e}")
                continue

            indices_to_filter |= set(sorted_group[1:])

        return indices_to_filter

    @staticmethod
    def filter_recurring_elements(  # noqa: C901
        content_list: list[ContentItemDict],
        images: dict[str, bytes],
        page_height: int,
        occurrence_threshold: int = 2,
    ) -> tuple[list[ContentItemDict], set[str], set[str], set[str]]:
        """
        Identifies and filters recurring elements from a content list using a multi-level signature strategy.

        Uses two filtering passes:
        1. Position-based: Filters text/tables in header/footer zones (top/bottom 10%)
        2. Content-based: Filters ALL recurring images regardless of position (e.g., logos)

        Args:
            content_list: The list of content elements from extraction provider.
            images: A dictionary mapping image filenames to their byte content.
            page_height: The height of a standard page in the document's coordinate system.
            occurrence_threshold: The minimum number of times a similar element must appear to be filtered.

        Returns:
            Tuple containing:
                - A new content list with filtered elements removed.
                - A set of image filenames that were filtered out.
                - A set of raw HTML table bodies that were filtered out.
                - A set of text content that was filtered out.
        """
        logger = _get_logger()

        header_zone_end = page_height * HEADER_ZONE_RATIO
        footer_zone_start = page_height * (1 - FOOTER_ZONE_RATIO)

        logger.info(
            f"filter_recurring_elements: {len(content_list)} content items, {len(images)} image bytes available"
        )

        # Two-pass filtering:
        # 1. Position-based: Text/tables in header/footer zones
        # 2. Content-based: ALL recurring images (regardless of position)

        potential_elements, all_images = HeaderFooterFilter._collect_candidate_elements(
            content_list, header_zone_end, footer_zone_start
        )

        logger.info(f"Found {len(all_images)} total images, {len(potential_elements)} elements in header/footer zones")

        if not potential_elements and not all_images:
            logger.info("No elements to filter (no images and no header/footer zone elements)")
            return content_list, set(), set(), set()

        # --- Multi-level Signature Grouping ---
        image_hashes = defaultdict(list)
        exact_text_hashes = defaultdict(list)
        normalized_text_hashes = defaultdict(list)
        table_html_hashes = defaultdict(list)

        # Helper function to process images with perceptual hashing
        def process_image(index: int, element: dict[str, Any]) -> bool:
            """Process an image and add to hash groups. Returns True if successfully processed."""
            img_ref = element.get("img_path")
            if not img_ref:
                return False

            # Handle both "images/filename.png" and "filename.png" formats
            img_key = img_ref.replace("images/", "") if img_ref.startswith("images/") else img_ref
            image_bytes = images.get(img_key) or images.get(img_ref)

            if not image_bytes:
                return False

            try:
                with _pil_lock, Image.open(io.BytesIO(image_bytes)) as img:
                    img_hash = imagehash.phash(img, hash_size=IMAGE_HASH_SIZE)
                _assign_hash_group(image_hashes, img_hash, index)
                return True
            except Exception as e:
                logger.warning(f"Could not process image {img_ref}: {e}")
                return False

        # Process ALL images for content-based filtering (catches logos anywhere on page)
        logger.info(f"Processing {len(all_images)} images for perceptual hash comparison (hash_size={IMAGE_HASH_SIZE})")
        processed_count = 0
        for item in all_images:
            if process_image(item["index"], item["element"]):
                processed_count += 1

        logger.info(f"Successfully hashed {processed_count}/{len(all_images)} images into {len(image_hashes)} groups")

        # Log image hash groups for debugging
        for _img_hash, indices in image_hashes.items():
            if len(indices) > 1:
                img_paths = [content_list[i].get("img_path", "?") for i in indices]
                logger.info(f"Found {len(indices)} similar images (will filter {len(indices) - 1}): {img_paths}")

        # Process position-based elements (header/footer zone) for text/tables
        for item in potential_elements:
            element = item["element"]
            index = item["index"]
            elem_type = element.get("type")

            # Priority 1: For tables, use HTML body as primary signature (more reliable than image)
            if elem_type == "table" and element.get("table_body"):
                table_html = element["table_body"].strip()
                if table_html:
                    table_html_hashes[hash(table_html)].append(index)
                    continue

            # Priority 2: Image-based signature for images in header/footer zones
            # (Note: all_images pass already processed these, but process_image handles duplicates)
            if elem_type in ["table", "image", "img"] and element.get("img_path"):
                process_image(index, element)

            # Priority 3: Text-based signatures for text elements
            elif elem_type == "text" and element.get("text"):
                text_content = element["text"].strip()
                if not text_content:
                    continue

                # Exact match signature
                exact_text_hashes[hash(text_content)].append(index)

                # Normalized match signature (for text with page numbers etc.)
                normalized_text = HeaderFooterFilter._get_normalized_text(text_content)
                if normalized_text != text_content:
                    normalized_text_hashes[hash(normalized_text)].append(index)

        # --- Filtering based on grouped signatures ---
        all_groups = (
            list(table_html_hashes.values())
            + list(image_hashes.values())
            + list(exact_text_hashes.values())
            + list(normalized_text_hashes.values())
        )
        indices_to_filter = HeaderFooterFilter._identify_recurring_groups(
            all_groups, occurrence_threshold, content_list
        )

        if not indices_to_filter:
            logger.info("No recurring elements found to filter")
            return content_list, set(), set(), set()

        # --- Collect details of items to be removed ---
        images_to_filter: set[str] = set()
        html_tables_to_filter: set[str] = set()
        text_to_filter: set[str] = set()

        for i in indices_to_filter:
            _collect_furniture_assets(content_list[i], images_to_filter, html_tables_to_filter, text_to_filter)

        logger.info(
            f"Filtering {len(indices_to_filter)} recurring elements: "
            f"{len(images_to_filter)} unique images, "
            f"{len(html_tables_to_filter)} unique HTML tables, and "
            f"{len(text_to_filter)} unique text blocks. "
            f"(Checked {len(all_images)} images total, {len(potential_elements)} position-based elements)"
        )

        filtered_content_list = [elem for i, elem in enumerate(content_list) if i not in indices_to_filter]

        return (
            filtered_content_list,
            images_to_filter,
            html_tables_to_filter,
            text_to_filter,
        )
