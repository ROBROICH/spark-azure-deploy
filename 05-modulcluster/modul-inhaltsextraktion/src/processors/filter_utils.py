"""Shared utilities for header/footer filtering."""

import logging

import imagehash
from temporalio import activity

from src.processors.filtering_config import IMAGE_SIMILARITY_THRESHOLD
from src.providers.base import ContentItemDict

__all__ = ["_assign_hash_group", "_collect_furniture_assets", "_get_logger"]

# Fallback logger for when not in Temporal activity context
_module_logger = logging.getLogger(__name__)


def _get_logger() -> logging.Logger | logging.LoggerAdapter:  # type: ignore[type-arg]
    """Get appropriate logger - activity logger if in activity context, else module logger."""
    if activity.in_activity():
        return activity.logger
    return _module_logger


def _assign_hash_group(
    image_hashes: dict[imagehash.ImageHash, list[int]],
    img_hash: imagehash.ImageHash,
    index: int,
) -> None:
    """Assign an image index to an existing similar hash group or create a new one."""
    for representative_hash in list(image_hashes.keys()):
        if img_hash - representative_hash <= IMAGE_SIMILARITY_THRESHOLD:
            image_hashes[representative_hash].append(index)
            return
    image_hashes[img_hash] = [index]


def _collect_furniture_assets(
    element: ContentItemDict,
    images_to_filter: set[str],
    html_tables_to_filter: set[str],
    text_to_filter: set[str],
) -> None:
    """Categorize a furniture element's assets into the appropriate filter sets."""
    elem_type = element.get("type", "")
    if elem_type in ("table", "image", "img"):
        img_path = element.get("img_path")
        if img_path:
            images_to_filter.add(str(img_path))
        table_body = element.get("table_body")
        if table_body:
            html_tables_to_filter.add(str(table_body))
    elif elem_type == "text":
        text_val = element.get("text")
        if text_val:
            text_to_filter.add(str(text_val))
