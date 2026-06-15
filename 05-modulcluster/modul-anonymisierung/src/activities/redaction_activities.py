"""Temporal activities for the redaction pipeline — text extraction and redaction."""

import tempfile

import pypdfium2 as pdfium
from temporalio import activity

from src.config import config as cfg
from src.models.schemas import (
    ApplyRedactionsInput,
    ApplyRedactionsResult,
    DetectPiiPresidioInput,
    DetectPiiPresidioResult,
    ExtractTextsInput,
    ExtractTextsResult,
    PagePiiData,
    PageTextData,
)
from src.services.pdf_extractor import extract_all_texts
from src.services.pii_matcher import fuzzy_search_pdf
from src.services.presidio_detector import detect_pii_in_lines
from src.services.redactor import redact_pdf


@activity.defn(name="extract_texts")
def extract_texts(inp: ExtractTextsInput) -> ExtractTextsResult:
    """Extract text from all pages of a PDF provided as bytes.

    For pages without extractable text, OCR is used as fallback (single pass).
    Returns the extracted text per page AND an OCR-enriched PDF
    (scanned pages get a text layer so redaction can find the text).
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(inp.pdf_data)
        tmp.flush()

        activity.heartbeat("Extracting text from all pages...")
        page_lines_list, ocr_pdf_data = extract_all_texts(tmp.name)

    pages = [
        PageTextData(page_number=i, page_lines=lines)
        for i, lines in enumerate(page_lines_list)
    ]

    activity.logger.info("Extracted text from %d pages", len(pages))
    return ExtractTextsResult(pages=pages, ocr_pdf_data=ocr_pdf_data)


@activity.defn(name="apply_redactions")
def apply_redactions(inp: ApplyRedactionsInput) -> ApplyRedactionsResult:
    """Apply PII redactions to all pages of a PDF.

    Performs fuzzy matching per page, then delegates to the rasterize-and-blackout
    redaction pipeline.
    """
    pii_terms = inp.pii_terms
    error_pages = list(inp.error_pages)

    if not pii_terms:
        # No terms to match — return early with unmodified PDF
        doc = pdfium.PdfDocument(inp.pdf_data)
        num_pages = len(doc)
        doc.close()
        return ApplyRedactionsResult(
            redacted_pdf=inp.pdf_data,
            pages_processed=num_pages,
            matches_found=0,
            error_pages=error_pages,
        )

    # Extract text per page for fuzzy matching
    doc = pdfium.PdfDocument(inp.pdf_data)
    num_pages = len(doc)
    page_matched_values: dict[int, set[str]] = {}

    try:
        for page_num in range(num_pages):
            page = doc[page_num]
            textpage = page.get_textpage()
            page_content = textpage.get_text_range()
            textpage.close()
            page.close()

            matched_values = fuzzy_search_pdf(page_content, pii_terms, threshold=cfg.FUZZY_THRESHOLD)
            if matched_values:
                page_matched_values[page_num] = matched_values

            activity.heartbeat(f"Matched page {page_num + 1}/{num_pages}")
    finally:
        doc.close()

    # Redact all pages in one pass
    activity.heartbeat(f"Redacting {len(page_matched_values)} pages...")
    redacted_bytes, total_matches = redact_pdf(inp.pdf_data, page_matched_values)

    activity.logger.info(
        "Redaction complete: %d pages, %d matches, %d error pages",
        num_pages,
        total_matches,
        len(error_pages),
    )

    return ApplyRedactionsResult(
        redacted_pdf=redacted_bytes,
        pages_processed=num_pages,
        matches_found=total_matches,
        error_pages=error_pages,
    )


@activity.defn(name="detect_pii_presidio")
def detect_pii_presidio(inp: DetectPiiPresidioInput) -> DetectPiiPresidioResult:
    """Detect PII per page via Presidio + spaCy (deterministic baseline).

    Runs the Presidio analyzer (lazily initialized as a process-wide
    singleton) over every page and returns the matched surface forms.
    Designed to run in parallel to the LLM-based detection path; results
    are merged in the workflow before redaction.
    """
    presidio_cfg = cfg.PRESIDIO
    page_pii: list[PagePiiData] = []
    total_terms = 0
    num_pages = len(inp.pages)

    for idx, page in enumerate(inp.pages):
        terms = detect_pii_in_lines(page.page_lines, presidio_cfg)
        page_pii.append(PagePiiData(page_number=page.page_number, pii_terms=terms))
        total_terms += len(terms)
        activity.heartbeat(f"Presidio page {idx + 1}/{num_pages}")

    activity.logger.info(
        "Presidio detection complete: %d pages, %d total terms",
        num_pages,
        total_terms,
    )
    return DetectPiiPresidioResult(page_pii=page_pii)
