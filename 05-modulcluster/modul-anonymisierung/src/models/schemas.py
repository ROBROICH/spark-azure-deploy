"""Pydantic schemas for the Temporal redaction workflow I/O."""

from pydantic import BaseModel, Field
from temporal import Base64Bytes

# ---------------------------------------------------------------------------
# Activity I/O schemas
# ---------------------------------------------------------------------------


class PageTextData(BaseModel):
    """Extracted text data for a single page."""

    page_number: int
    page_lines: list[str]


class ExtractTextsInput(BaseModel):
    """Input for the extract_texts activity."""

    pdf_data: Base64Bytes = Field(description="Raw PDF content.")


class ExtractTextsResult(BaseModel):
    """Output from the extract_texts activity."""

    pages: list[PageTextData]
    ocr_pdf_data: Base64Bytes = Field(description="PDF with OCR text layer applied to scanned pages.")


class PagePiiData(BaseModel):
    """PII extraction results for a single page."""

    page_number: int
    pii_terms: list[str] = Field(default_factory=list)


class DetectPiiPresidioInput(BaseModel):
    """Input for the detect_pii_presidio activity."""

    pages: list[PageTextData]


class DetectPiiPresidioResult(BaseModel):
    """Output from the detect_pii_presidio activity."""

    page_pii: list[PagePiiData]


class ApplyRedactionsInput(BaseModel):
    """Input for the apply_redactions activity."""

    pdf_data: Base64Bytes = Field(description="Raw PDF content to redact.")
    pii_terms: list[str] = Field(description="Flat list of all PII terms to search on every page.")
    error_pages: list[int] = Field(default_factory=list, description="Pages where PII detection failed.")


class ApplyRedactionsResult(BaseModel):
    """Output from the apply_redactions activity."""

    redacted_pdf: Base64Bytes = Field(description="Redacted PDF content.")
    pages_processed: int = 0
    matches_found: int = 0
    error_pages: list[int] = Field(default_factory=list, description="Page numbers where PII detection failed.")
