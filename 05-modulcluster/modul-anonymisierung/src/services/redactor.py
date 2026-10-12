"""PDF redaction — rasterize PII pages, black out matches, restore text layer via OCR."""

import logging
import tempfile
from io import BytesIO
from pathlib import Path

import img2pdf
import pikepdf
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

from src.config import config as cfg
from src.services.ocr import run_ocrmypdf

logger = logging.getLogger(__name__)

# Catalog entries that may hold a direct reference to a replaced page object,
# and that may themselves carry copies of page text (bookmark titles, /Alt and
# /ActualText in the structure tree, form field values).
_UNSAFE_CATALOG_KEYS = (
    "/Outlines",
    "/Names",
    "/Dests",
    "/OpenAction",
    "/AA",
    "/StructTreeRoot",
    "/Threads",
    "/AcroForm",
)

# Content-bearing entries of a page object.
_PAGE_CONTENT_KEYS = (
    "/Contents",
    "/Resources",
    "/Annots",
    "/Thumb",
    "/B",
    "/PieceInfo",
    "/Metadata",
    "/AA",
)


class RedactionLeakError(RuntimeError):
    """Raised when the redacted PDF still contains pre-redaction page content."""


def redact_pdf(
    pdf_data: bytes,
    page_matched_values: dict[int, set[str]],
    *,
    dpi: int = 150,
    margin: float = cfg.REDACTION_MARGIN_PTS,
) -> tuple[bytes, int]:
    """Redact PII from a PDF by rasterizing affected pages and blacking out matches.

    Only pages with PII are rasterized; clean pages retain original quality.
    A text layer is restored on rasterized pages via OCR.

    Returns ``(redacted_pdf_bytes, total_matches)`` where *total_matches*
    is the number of distinct PII values that had at least one hit.
    """
    if not page_matched_values:
        return pdf_data, 0

    scale = dpi / 72.0
    total_matches = 0
    rasterized_pages: dict[int, Path] = {}

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Phase 1: Search, render, and black out PII pages
        doc = pdfium.PdfDocument(pdf_data)
        try:
            for page_num, matched_values in sorted(page_matched_values.items()):
                if not matched_values:
                    continue

                page = doc[page_num]
                textpage = page.get_textpage()
                page_height = page.get_height()

                rects, values_found = _search_page_for_values(textpage, matched_values, margin)
                textpage.close()

                if rects:
                    total_matches += values_found

                    bitmap = page.render(scale=scale)
                    img = bitmap.to_pil()

                    _blackout_rects(img, rects, scale, page_height)

                    img_path = tmpdir_path / f"page_{page_num}.jpg"
                    img.save(img_path, "JPEG", quality=85, dpi=(dpi, dpi))
                    img.close()
                    rasterized_pages[page_num] = img_path

                page.close()
        finally:
            doc.close()

        if not rasterized_pages:
            return pdf_data, 0

        # Phase 2: Assemble final PDF — replace rasterized pages, keep originals
        assembled_path = tmpdir_path / "assembled.pdf"
        with pikepdf.open(BytesIO(pdf_data)) as original_pdf:
            for page_num, img_path in sorted(rasterized_pages.items()):
                img_pdf_bytes = img2pdf.convert(str(img_path))
                with pikepdf.open(BytesIO(img_pdf_bytes)) as img_pdf:
                    original_pdf.pages[page_num] = img_pdf.pages[0]

            _drop_stale_page_content(original_pdf)
            original_pdf.save(assembled_path)

        # Phase 3: Restore text layer on rasterized pages via OCR
        rasterized_page_nums = sorted(rasterized_pages.keys())
        ocr_output = tmpdir_path / "redacted_ocr.pdf"
        try:
            run_ocrmypdf(
                assembled_path,
                ocr_output,
                rasterized_page_nums,
                optimize=1,
            )
            result_bytes = ocr_output.read_bytes()
        except Exception:
            logger.exception("OCR failed for pages %s, keeping without text layer", rasterized_page_nums)
            result_bytes = assembled_path.read_bytes()

    _assert_no_stale_page_content(result_bytes)

    return result_bytes, total_matches


def _stale_pages(pdf: pikepdf.Pdf) -> list[pikepdf.Object]:
    """Page objects that are no longer part of the page tree.

    Assigning to ``pdf.pages[n]`` only rewires ``/Pages``; the replaced page
    object itself stays in the file and is still written out as long as anything
    else references it.
    """
    live = {page.obj.objgen for page in pdf.pages}
    stale = []
    for obj in pdf.objects:
        try:
            if obj.get("/Type") == pikepdf.Name.Page and obj.objgen not in live:
                stale.append(obj)
        except Exception:  # non-dictionary object
            continue
    return stale


def _drop_stale_page_content(pdf: pikepdf.Pdf) -> None:
    """Make pre-redaction page content unrecoverable from the saved PDF.

    Two layers, because a blocklist of referencing structures can never be
    complete:

    1. Drop catalog entries that can point straight at a replaced page
       (bookmarks, named destinations, structure tree, articles, form fields).
       These also carry duplicates of page text in their own right.
    2. Empty out any page object left outside the page tree, so a reference we
       did not anticipate can only reach an empty husk.
    """
    for key in _UNSAFE_CATALOG_KEYS:
        if key in pdf.Root:
            del pdf.Root[key]

    for page in _stale_pages(pdf):
        for key in _PAGE_CONTENT_KEYS:
            if key in page:
                del page[key]


def _assert_no_stale_page_content(pdf_bytes: bytes) -> None:
    """Fail closed if the finished PDF still carries pre-redaction page content.

    A well-formed rewrite has no content-bearing page object outside the page
    tree, so a hit here means unredacted content is still extractable. Raising
    keeps the leaking document from being returned to the caller.
    """
    with pikepdf.open(BytesIO(pdf_bytes)) as pdf:
        offenders = [page.objgen for page in _stale_pages(pdf) if any(key in page for key in _PAGE_CONTENT_KEYS)]
    if offenders:
        raise RedactionLeakError(f"Redacted PDF still contains pre-redaction page content in objects {offenders}")


def _search_page_for_values(
    textpage: pdfium.PdfTextPage,
    matched_values: set[str],
    margin: float,
) -> tuple[list[tuple[float, float, float, float]], int]:
    """Search for PII values on a text page.

    Returns ``(padded_rects, values_found_count)``.
    Rects are ``(left, bottom, right, top)`` in PDF coordinate space.
    """
    rects: list[tuple[float, float, float, float]] = []
    values_found = 0

    for value in matched_values:
        value_found = False
        searcher = textpage.search(value)
        result = searcher.get_next()
        while result is not None:
            value_found = True
            idx, cnt = result
            n_rects = textpage.count_rects(idx, cnt)
            for i in range(n_rects):
                left, bottom, right, top = textpage.get_rect(i)
                rects.append((left - margin, bottom - margin, right + margin, top + margin))
            result = searcher.get_next()
        searcher.close()
        if value_found:
            values_found += 1

    return rects, values_found


def _blackout_rects(
    img: Image.Image,
    rects: list[tuple[float, float, float, float]],
    scale: float,
    page_height: float,
) -> None:
    """Draw black rectangles over PII regions on a rendered page image.

    Converts PDF coordinates (origin bottom-left) to image coordinates
    (origin top-left).
    """
    draw = ImageDraw.Draw(img)
    img_w, img_h = img.size
    for left, bottom, right, top in rects:
        img_left = max(0, left * scale)
        img_right = min(img_w, right * scale)
        img_top = max(0, (page_height - top) * scale)
        img_bottom = min(img_h, (page_height - bottom) * scale)
        x0, x1 = (img_left, img_right) if img_left <= img_right else (img_right, img_left)
        y0, y1 = (img_top, img_bottom) if img_top <= img_bottom else (img_bottom, img_top)
        if x1 <= x0 or y1 <= y0:
            continue
        draw.rectangle([x0, y0, x1, y1], fill="black")
