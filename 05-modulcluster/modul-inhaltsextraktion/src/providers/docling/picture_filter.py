"""Drops proven recurring page furniture before image extraction and upload.

A logo in a header or footer is reported by docling as a picture on every
single page.  Extracting it means one crop, one DMS upload and one perceptual
hash per page, only for the downstream recurring-element filter to throw all
but the first copy away again.  Checking candidates before extraction avoids
uploading duplicates while leaving distinct content behind.

Two conditions have to hold together, and each covers the other's blind spot:
page furniture is *small* -- measured on real project data it covers 0.5% of a
page against 11.9% for the smallest genuine figure -- and it *recurs* on the
majority of pages, where genuine figures reach at most 30%.  A full-page image
repeated on many pages fails the area test; a small one-off figure fails the
recurrence test.

Samples cheaply reject heterogeneous groups. Every remaining candidate must
match the first member's perceptual hash before it is dropped; sampled hashes
are reused. Visually distinct pictures and candidates that cannot be rendered
or hashed are kept.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from itertools import chain
from typing import Any

import imagehash
from PIL import Image

from src.config import get_config
from src.processors.filtering_config import IMAGE_HASH_SIZE, IMAGE_SIMILARITY_THRESHOLD
from src.providers.docling.page_renderer import PageRenderer
from src.utils.pil_lock import _pil_lock

__all__ = ["PictureFilter"]

logger = logging.getLogger(__name__)

# A group needs at least two members before "recurring" means anything.
_MIN_GROUP_SIZE = 2


@dataclass
class _SizeGroup:
    """Pictures of about the same size, wherever they sit on their page."""

    width: float
    height: float
    members: list[tuple[int, int, dict[str, float]]] = field(default_factory=list)
    max_area_fraction: float = 0.0


class PictureFilter:
    """Identifies recurring page furniture among docling's pictures."""

    @staticmethod
    def _picture_geometry(
        picture: dict[str, Any], pages: dict[str, Any]
    ) -> tuple[int, dict[str, float], float, float] | None:
        """Return (page_no, bbox, width_pt, height_pt) for a picture, or None."""
        prov = picture.get("prov") or []
        if not prov:
            return None
        first = prov[0]
        bbox = first.get("bbox")
        page_no = first.get("page_no")
        if not bbox or page_no is None:
            return None
        try:
            width = abs(float(bbox.get("r", 0)) - float(bbox.get("l", 0)))
            height = abs(float(bbox.get("t", 0)) - float(bbox.get("b", 0)))
        except (TypeError, ValueError):
            return None
        if width <= 0 or height <= 0:
            return None
        return int(page_no), bbox, width, height

    @staticmethod
    def _area_fraction(page_no: int, width: float, height: float, pages: dict[str, Any]) -> float:
        """Picture area as a fraction of its page.

        Fails closed: an unknown page size returns 1.0, so the picture counts
        as full-page and the area guard keeps it. Returning 0.0 would make the
        guard wave through exactly the pictures it cannot judge.
        """
        size = (pages.get(str(page_no)) or {}).get("size") or {}
        try:
            page_area = float(size.get("width", 0)) * float(size.get("height", 0))
        except (TypeError, ValueError):
            return 1.0
        if page_area <= 0:
            return 1.0
        return (width * height) / page_area

    @staticmethod
    def _matching_group(groups: list[_SizeGroup], width: float, height: float, tolerance: float) -> _SizeGroup | None:
        """The first group whose size is within tolerance, or None."""
        for group in groups:
            if abs(group.width - width) <= tolerance and abs(group.height - height) <= tolerance:
                return group
        return None

    @staticmethod
    def _duplicate_member_indices(
        members: list[tuple[int, int, dict[str, float]]],
        renderer: PageRenderer,
        sample_size: int,
    ) -> set[int]:
        """Return only members proven to match the retained first occurrence."""
        if len(members) < _MIN_GROUP_SIZE or sample_size < _MIN_GROUP_SIZE:
            return set()

        step = max(1, len(members) // sample_size)
        sampled = members[::step][:sample_size]
        sampled_indices = {idx for idx, _page_no, _bbox in sampled}
        reference_hash: imagehash.ImageHash | None = None
        duplicates: set[int] = set()
        # Check the sample first, then only members not already hashed.
        for idx, page_no, bbox in chain(sampled, (m for m in members if m[0] not in sampled_indices)):
            try:
                png = renderer.crop_png(page_no, bbox)
                if png is None:
                    if idx in sampled_indices:
                        return set()
                    continue
                with _pil_lock, Image.open(io.BytesIO(png)) as img:
                    candidate_hash = imagehash.phash(img, hash_size=IMAGE_HASH_SIZE)
            except Exception as exc:  # an unreadable crop proves nothing
                logger.warning(f"Could not hash furniture candidate on page {page_no}: {exc}")
                if idx in sampled_indices:
                    return set()
                continue

            if reference_hash is None:
                reference_hash = candidate_hash
            elif candidate_hash - reference_hash <= IMAGE_SIMILARITY_THRESHOLD:
                duplicates.add(idx)
            elif idx in sampled_indices:
                return set()
        return duplicates

    @staticmethod
    def find_furniture_indices(doc_json: dict[str, Any], renderer: PageRenderer) -> set[int]:
        """Indices into ``doc_json["pictures"]`` that are recurring furniture.

        The first occurrence of each furniture group is kept, matching the
        semantics of the downstream duplicate filter.

        Args:
            doc_json: Document JSON from docling-serve.
            renderer: Renderer used to verify candidate perceptual hashes.

        Returns:
            Set of picture indices to skip.
        """
        cfg = get_config()
        if not cfg.ENABLE_PICTURE_FURNITURE_FILTER:
            return set()

        pictures = doc_json.get("pictures") or []
        pages = doc_json.get("pages") or {}
        page_count = len(pages)
        if not pictures or page_count == 0:
            return set()

        tolerance = cfg.PICTURE_FURNITURE_SIZE_TOLERANCE_PT
        # Group by size within a tolerance rather than by a rounded key: the
        # same logo measures 101-107pt wide across pages, and a rounding
        # boundary anywhere in that range would split it into two groups.
        # Position is deliberately not part of the key for the same reason.
        groups: list[_SizeGroup] = []
        for idx, picture in enumerate(pictures):
            geometry = PictureFilter._picture_geometry(picture, pages)
            if geometry is None:
                continue
            page_no, bbox, width, height = geometry
            area_fraction = PictureFilter._area_fraction(page_no, width, height, pages)
            group = PictureFilter._matching_group(groups, width, height, tolerance)
            if group is None:
                group = _SizeGroup(width=width, height=height)
                groups.append(group)
            group.members.append((idx, page_no, bbox))
            group.max_area_fraction = max(group.max_area_fraction, area_fraction)

        furniture: set[int] = set()
        for group in groups:
            members = group.members
            if group.max_area_fraction > cfg.PICTURE_FURNITURE_MAX_AREA_FRACTION:
                continue
            page_share = len({page_no for _idx, page_no, _bbox in members}) / page_count
            if page_share < cfg.PICTURE_FURNITURE_MIN_PAGE_SHARE:
                continue
            furniture.update(
                PictureFilter._duplicate_member_indices(members, renderer, cfg.PICTURE_FURNITURE_HASH_SAMPLE_SIZE)
            )

        if furniture:
            logger.info(
                f"Picture furniture filter: dropping {len(furniture)} of {len(pictures)} pictures "
                f"across {page_count} pages"
            )
        return furniture
