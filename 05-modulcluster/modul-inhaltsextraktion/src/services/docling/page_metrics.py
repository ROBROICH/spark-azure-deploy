"""Cheap structural metrics for a PDF, read straight from the content streams.

Counting text-showing and XObject operators costs milliseconds and needs no
rendering, so it can gate expensive downstream work. Large-format plan sheets
(Höhenpläne, Bestands- und Konfliktpläne) carry thousands of individually
placed labels on pages many times the size of A4 -- docling spends about an
hour per sheet on them for less content than the PDF text layer already
carries, so they are worth detecting up front.

CAD/GIS exports are detected without a page walk: Esri, AutoCAD, MicroStation,
Bentley, QGIS, and Foxit Phantom (the reprint path for every .dgn Title in this
corpus). A Title that ends in .dgn/.dwg/.dxf also counts.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass

import pikepdf

__all__ = ["PdfMetrics", "collect_pdf_metrics"]

logger = logging.getLogger(__name__)

# Text-showing operators: Tj, TJ, ' and " (all end a string or array argument).
_TEXT_OPS = re.compile(rb"\)\s*Tj|\]\s*TJ|\)\s*'|\)\s*\"")
# XObject invocations: "/Name Do".
_XOBJ_OPS = re.compile(rb"/[A-Za-z0-9_.\-]+\s+Do\b")

_A4_POINTS2 = 595.0 * 842.0
_PDF_USER_UNIT_DPI = 72.0

# Half the page at 150 dpi counts as a usable raster for Docling/VLM.
USABLE_RASTER_DPI = 150
USABLE_RASTER_COVERAGE = 0.5
# TransnetBW tiles are 10473x51 ~ 205:1; 130 strips, max single image ~0.05x page.
STRIP_ASPECT_RATIO = 50
STRIP_COUNT_NOT_USABLE = 20
CAD_CREATOR_MARKERS = (
    "esri",
    "arcmap",
    "autocad",
    "microstation",
    "bentley",
    "qgis",
    "foxit phantom",
)
CAD_PATH_MARKERS = (".dgn", ".dwg", ".dxf")


@dataclass(frozen=True)
class PdfMetrics:
    """Structural cost indicators for one PDF."""

    pages: int
    text_ops: int
    xobj_ops: int
    max_area_a4: float
    """Largest page area, in multiples of an A4 page."""
    total_load: float
    """Sum over pages of (elements on the page) x (page area in A4 units)."""
    max_page_load: float
    cad_creator: bool
    has_usable_raster: bool
    image_count: int
    max_image_px: int
    sum_image_px: int
    strip_count: int

    @property
    def elements(self) -> int:
        """Total number of drawing operations that carry content."""
        return self.text_ops + self.xobj_ops


def _page_content(page: pikepdf.Page) -> bytes:
    """Return the decompressed content stream of a page, tolerating arrays."""
    try:
        contents = page.obj["/Contents"]
    except Exception:
        return b""
    streams = list(contents) if isinstance(contents, pikepdf.Array) else [contents]
    parts = []
    for stream in streams:
        try:
            parts.append(stream.read_bytes())
        except Exception:
            continue
    return b"".join(parts)


def _docinfo_text(info: object, key: str) -> str:
    """Stringify a document-info value, or empty if missing."""
    try:
        value = info.get(key)  # type: ignore[union-attr]
    except Exception:
        return ""
    if value is None:
        return ""
    return str(value)


def _xmp_text(pdf: pikepdf.Pdf) -> str:
    """UTF-8 XMP packet from the document catalog, or empty."""
    try:
        metadata = pdf.Root.get("/Metadata")
    except Exception:
        return ""
    if not isinstance(metadata, pikepdf.Stream):
        return ""
    try:
        return metadata.read_bytes().decode("utf-8", "replace")
    except Exception:
        return ""


def _cad_identity_blob(pdf: pikepdf.Pdf) -> str:
    """Creator/Producer/Title plus XMP, lowercased for marker search."""
    parts: list[str] = []
    try:
        info = pdf.docinfo
    except Exception:
        info = None
    if info is not None:
        parts.append(_docinfo_text(info, "/Creator"))
        parts.append(_docinfo_text(info, "/Producer"))
        for extra in ("/Author", "/Title"):
            try:
                present = extra in info
            except Exception:
                present = False
            if present:
                parts.append(_docinfo_text(info, extra))
    parts.append(_xmp_text(pdf))
    return " ".join(parts).lower()


def _title_is_cad_path(title: str) -> bool:
    """True when the document title is a CAD source path (…/sheet.dgn)."""
    name = title.strip().lower()
    return any(name.endswith(ext) for ext in CAD_PATH_MARKERS)


def _is_cad_creator(pdf: pikepdf.Pdf) -> bool:
    """True when Info or XMP names a CAD/GIS tool, or Title ends in a CAD extension."""
    blob = _cad_identity_blob(pdf)
    if any(marker in blob for marker in CAD_CREATOR_MARKERS):
        return True
    try:
        info = pdf.docinfo
    except Exception:
        return False
    try:
        has_title = "/Title" in info
    except Exception:
        has_title = False
    return has_title and _title_is_cad_path(_docinfo_text(info, "/Title"))


def _image_size(obj: pikepdf.Stream) -> tuple[int, int] | None:
    """Pixel width and height of an Image XObject, or None if missing."""
    try:
        width = int(obj.get("/Width") or 0)
        height = int(obj.get("/Height") or 0)
    except (TypeError, ValueError):
        return None
    if width <= 0 or height <= 0:
        return None
    return width, height


def _is_strip(width: int, height: int) -> bool:
    short = min(width, height)
    return short > 0 and max(width, height) / short >= STRIP_ASPECT_RATIO


def _usable_raster_threshold_px(page_w_pt: float, page_h_pt: float) -> float:
    return USABLE_RASTER_COVERAGE * page_w_pt * page_h_pt * (USABLE_RASTER_DPI / _PDF_USER_UNIT_DPI) ** 2


def _walk_xobjects(resources: object, seen_forms: set[tuple[int, int]]) -> tuple[list[bytes], list[tuple[int, int]]]:
    """Form content streams and Image XObject pixel sizes, including nested forms."""
    contents: list[bytes] = []
    images: list[tuple[int, int]] = []
    if not resources:
        return contents, images
    xobjects = resources.get("/XObject")  # type: ignore[union-attr]
    if not xobjects:
        return contents, images
    for key in xobjects:
        obj = xobjects[key]
        if not isinstance(obj, pikepdf.Stream):
            continue
        subtype = obj.get("/Subtype")
        if subtype == pikepdf.Name.Image:
            size = _image_size(obj)
            if size is not None:
                images.append(size)
            continue
        if subtype != pikepdf.Name.Form:
            continue
        objgen = obj.objgen
        if objgen in seen_forms:
            continue
        seen_forms.add(objgen)
        try:
            contents.append(obj.read_bytes())
        except Exception as exc:  # unreadable stream, keep scanning
            logger.debug("Skipping unreadable form XObject: %s", exc)
        nested_contents, nested_images = _walk_xobjects(obj.get("/Resources"), seen_forms)
        contents.extend(nested_contents)
        images.extend(nested_images)
    return contents, images


def _cad_skip_metrics() -> PdfMetrics:
    return PdfMetrics(
        pages=0,
        text_ops=0,
        xobj_ops=0,
        max_area_a4=0.0,
        total_load=0.0,
        max_page_load=0.0,
        cad_creator=True,
        has_usable_raster=False,
        image_count=0,
        max_image_px=0,
        sum_image_px=0,
        strip_count=0,
    )


def collect_pdf_metrics(pdf_bytes: bytes) -> PdfMetrics:
    """Read structural metrics from a PDF without rendering it.

    CAD/GIS Creator or Producer is an early exit: pages are not walked.

    Raises:
        pikepdf.PdfError: If the PDF cannot be opened.
    """
    pages = 0
    text_ops = 0
    xobj_ops = 0
    max_area = 0.0
    total_load = 0.0
    max_page_load = 0.0
    image_count = 0
    max_image_px = 0
    sum_image_px = 0
    strip_count = 0
    has_usable_raster = False

    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        if _is_cad_creator(pdf):
            return _cad_skip_metrics()

        for page in pdf.pages:
            pages += 1
            form_chunks, image_sizes = _walk_xobjects(page.get("/Resources"), set())
            chunks = [_page_content(page), *form_chunks]

            page_text = sum(len(_TEXT_OPS.findall(c)) for c in chunks)
            page_xobj = sum(len(_XOBJ_OPS.findall(c)) for c in chunks)

            box = [float(v) for v in page.MediaBox]
            page_w_pt = abs(box[2] - box[0])
            page_h_pt = abs(box[3] - box[1])
            area_a4 = (page_w_pt * page_h_pt) / _A4_POINTS2

            load = (page_text + page_xobj) * area_a4
            text_ops += page_text
            xobj_ops += page_xobj
            max_area = max(max_area, area_a4)
            total_load += load
            max_page_load = max(max_page_load, load)

            page_max_px = 0
            page_strips = 0
            for width, height in image_sizes:
                pixels = width * height
                image_count += 1
                max_image_px = max(max_image_px, pixels)
                sum_image_px += pixels
                page_max_px = max(page_max_px, pixels)
                if _is_strip(width, height):
                    page_strips += 1
                    strip_count += 1

            if page_strips < STRIP_COUNT_NOT_USABLE and page_max_px >= _usable_raster_threshold_px(
                page_w_pt, page_h_pt
            ):
                has_usable_raster = True

    return PdfMetrics(
        pages=pages,
        text_ops=text_ops,
        xobj_ops=xobj_ops,
        max_area_a4=round(max_area, 2),
        total_load=round(total_load, 1),
        max_page_load=round(max_page_load, 1),
        cad_creator=False,
        has_usable_raster=has_usable_raster,
        image_count=image_count,
        max_image_px=max_image_px,
        sum_image_px=sum_image_px,
        strip_count=strip_count,
    )
