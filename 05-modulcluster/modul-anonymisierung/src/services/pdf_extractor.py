"""Text extraction from PDF pages with OCR fallback (single-pass)."""

import logging
import tempfile
from pathlib import Path

import pypdfium2 as pdfium

from src.services.ocr import run_ocrmypdf

logger = logging.getLogger(__name__)


def extract_all_texts(
    pdf_path: str,
    lang: str = "deu",
) -> tuple[list[list[str]], bytes]:
    """Extract text from all pages, running OCR once for pages without text.

    Args:
        pdf_path: Path to the PDF file on disk.
        lang: Tesseract language code for OCR.

    Returns:
        ``(page_lines_list, enriched_pdf_bytes)`` where *page_lines_list*
        has one ``list[str]`` per page and *enriched_pdf_bytes* is the PDF
        with an OCR text layer added to previously-textless pages.
        If no OCR was needed, *enriched_pdf_bytes* is the original PDF bytes.
    """
    doc = pdfium.PdfDocument(pdf_path)
    num_pages = len(doc)

    page_texts: list[str] = []
    pages_needing_ocr: list[int] = []

    # Pass 1: read existing text, collect pages that need OCR
    for i in range(num_pages):
        page = doc[i]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        textpage.close()
        page.close()
        page_texts.append(text)
        if not text.strip():
            pages_needing_ocr.append(i)
    doc.close()

    original_bytes = Path(pdf_path).read_bytes()

    if not pages_needing_ocr:
        return [t.split("\n") for t in page_texts], original_bytes

    # Pass 2: single OCR run for all textless pages
    logger.info(
        "Running OCR on %d page(s) %s of %s",
        len(pages_needing_ocr),
        pages_needing_ocr,
        pdf_path,
    )
    try:
        ocr_pdf_bytes = _run_ocr_to_bytes(pdf_path, pages_needing_ocr, lang)
    except Exception:
        logger.warning(
            "OCR failed for pages %s of %s — those pages will have no text",
            pages_needing_ocr,
            pdf_path,
            exc_info=True,
        )
        return [t.split("\n") for t in page_texts], original_bytes

    # Re-read text from OCR'd pages
    ocr_doc = pdfium.PdfDocument(ocr_pdf_bytes)
    for page_num in pages_needing_ocr:
        page = ocr_doc[page_num]
        textpage = page.get_textpage()
        page_texts[page_num] = textpage.get_text_range()
        textpage.close()
        page.close()
    ocr_doc.close()

    return [t.split("\n") for t in page_texts], ocr_pdf_bytes


def _run_ocr_to_bytes(pdf_path: str, pages: list[int], lang: str) -> bytes:
    """Run ocrmypdf once on specified pages and return the enriched PDF bytes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "ocr_output.pdf"
        run_ocrmypdf(
            pdf_path,
            output_path,
            pages,
            lang=lang,
            rotate_pages=True,
            deskew=True,
        )
        return output_path.read_bytes()
