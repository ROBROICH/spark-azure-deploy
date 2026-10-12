"""Renders PDF pages locally and crops regions from them.

docling only embeds page rasters in its response when asked for
``image_export_mode=embedded``, and it then ships one full-page image for
*every* page -- roughly 0.8 MB per A4 page, of which almost nothing is used.
Cropping the few regions that need pixels straight from the PDF is both
cheaper and independent of what docling decides to render.

Page renders are cached per document, so a page carrying a table and a figure
is rasterized once. All pypdfium2 use is serialized through ``_pdfium_lock``.
"""

from __future__ import annotations

import io
import logging
import math
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

import pypdfium2 as pdfium

from src.config import get_config
from src.utils.pil_lock import _pil_lock

__all__ = ["BBox", "PageRenderer", "RenderedPage"]

logger = logging.getLogger(__name__)

# Matches the padding the table cropping has always applied.
_CROP_PADDING_PX = 5

# Only the pages of the current crop need to stay resident. Plan sheets aside,
# a chunk can carry 50 pages, and holding every render costs hundreds of MB.
_MAX_CACHED_PAGES = 4

# docling bbox keys: left, right, top, bottom in PDF points, BOTTOMLEFT origin.
BBox = dict[str, float]


@dataclass
class RenderedPage:
    """A rasterized PDF page plus the source dimensions its bboxes refer to."""

    pil_image: Any
    pdf_width: float
    pdf_height: float


@dataclass
class PageRenderer:
    """Caches page renders of one PDF document.

    Must be constructed and used inside ``_pdfium_lock``; it does not take the
    lock itself, so callers can hold it across a whole batch of crops.
    """

    pdf_doc: pdfium.PdfDocument
    scale: float
    max_pixels: int = 0
    _pages: OrderedDict[int, RenderedPage] = field(default_factory=OrderedDict)

    @classmethod
    def for_document(cls, pdf_doc: pdfium.PdfDocument, scale: float | None = None) -> PageRenderer:
        """Build a renderer using the configured image scale and pixel cap."""
        cfg = get_config()
        return cls(
            pdf_doc=pdf_doc,
            scale=scale if scale is not None else cfg.DOCLING_IMAGES_SCALE,
            max_pixels=cfg.RASTER_MAX_PIXELS,
        )

    def _page_scale(self, width_pt: float, height_pt: float) -> float:
        """Clamp the scale so an oversized page stays below the pixel cap.

        Same reasoning as pdf_rasterization._page_scale: plan and map sheets
        are many times A4, and a fixed scale produces bitmaps of several
        hundred MB, above PIL's DecompressionBomb limit.
        """
        area = width_pt * height_pt
        if self.max_pixels <= 0 or area <= 0:
            return self.scale
        return min(self.scale, math.sqrt(self.max_pixels / area))

    def page(self, page_no: int) -> RenderedPage | None:
        """Return the rendered page for a 1-based page number, or None."""
        page_idx = page_no - 1
        if page_idx < 0 or page_idx >= len(self.pdf_doc):
            logger.warning(f"Page {page_no} is outside the PDF ({len(self.pdf_doc)} pages)")
            return None

        cached = self._pages.get(page_idx)
        if cached is not None:
            self._pages.move_to_end(page_idx)
            return cached

        page = self.pdf_doc[page_idx]
        width_pt, height_pt = page.get_width(), page.get_height()
        bitmap = page.render(scale=self._page_scale(width_pt, height_pt))
        try:
            with _pil_lock:
                # to_pil() can share the pdfium buffer, so copy before the
                # bitmap is closed -- the cache outlives this call.
                pil_image = bitmap.to_pil().copy()
        finally:
            bitmap.close()

        rendered = RenderedPage(pil_image=pil_image, pdf_width=width_pt, pdf_height=height_pt)
        self._pages[page_idx] = rendered
        while len(self._pages) > _MAX_CACHED_PAGES:
            self._pages.popitem(last=False)
        return rendered

    def crop_png(self, page_no: int, bbox: BBox) -> bytes | None:
        """Crop a docling bbox out of a page and return PNG bytes.

        docling reports bboxes with a BOTTOMLEFT origin in PDF points, so the
        vertical coordinates are flipped against the rendered image.
        """
        rendered = self.page(page_no)
        if rendered is None:
            return None

        scale = self._page_scale(rendered.pdf_width, rendered.pdf_height)
        left = bbox.get("l", 0) * scale
        right = bbox.get("r", 0) * scale
        top = (rendered.pdf_height - bbox.get("t", 0)) * scale
        bottom = (rendered.pdf_height - bbox.get("b", 0)) * scale

        left = max(0, left - _CROP_PADDING_PX)
        top = max(0, top - _CROP_PADDING_PX)
        right = min(rendered.pil_image.width, right + _CROP_PADDING_PX)
        bottom = min(rendered.pil_image.height, bottom + _CROP_PADDING_PX)

        if left >= right or top >= bottom:
            logger.warning(f"Invalid crop region on page {page_no}: ({left}, {top}, {right}, {bottom})")
            return None

        with _pil_lock:
            cropped = rendered.pil_image.crop((int(left), int(top), int(right), int(bottom)))
            buffer = io.BytesIO()
            cropped.save(buffer, format="PNG")
        return buffer.getvalue()

    def close(self) -> None:
        """Drop cached renders. The PdfDocument stays owned by the caller."""
        self._pages.clear()
