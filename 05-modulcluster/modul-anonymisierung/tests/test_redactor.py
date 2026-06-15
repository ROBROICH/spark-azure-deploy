"""Tests for the redactor service — redact_pdf."""

import shutil
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pikepdf
import pypdfium2 as pdfium

from src.services.redactor import redact_pdf


def _create_test_pdf_bytes(text: str = "Max Mustermann Berlin") -> bytes:
    """Create a minimal single-page PDF with searchable text."""
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    page = pdf.pages[0]

    helvetica = pikepdf.Dictionary(
        Type=pikepdf.Name.Font,
        Subtype=pikepdf.Name.Type1,
        BaseFont=pikepdf.Name.Helvetica,
    )
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET"
    page[pikepdf.Name.Resources] = pikepdf.Dictionary(Font=pikepdf.Dictionary({"/F1": helvetica}))
    page[pikepdf.Name.Contents] = pdf.make_stream(content.encode())

    buf = BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _noop_ocr(input_path, output_path, pages, **kwargs):
    """Mock OCR that copies input to output (skips actual Tesseract)."""
    shutil.copy(input_path, output_path)


class TestRedactPdf:
    """Test the rasterize-and-blackout redaction pipeline."""

    @patch("src.services.ocr.run_ocrmypdf", side_effect=_noop_ocr)
    def test_redacts_found_values(self, _mock_ocr) -> None:
        """Matched values should be blacked out and counted."""
        pdf_data = _create_test_pdf_bytes("Max Mustermann wohnt in Berlin.")

        result_bytes, matches = redact_pdf(pdf_data, {0: {"Max Mustermann"}})

        assert matches >= 1
        assert len(result_bytes) > 0
        # After rasterization + noop OCR, no searchable text layer for the redacted term
        doc = pdfium.PdfDocument(result_bytes)
        page = doc[0]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        textpage.close()
        page.close()
        doc.close()
        assert "Max Mustermann" not in text

    def test_no_match_returns_original(self) -> None:
        """Values not present on the page should yield zero and return original PDF."""
        pdf_data = _create_test_pdf_bytes("Hier steht nichts Relevantes.")

        result_bytes, matches = redact_pdf(pdf_data, {0: {"Fantasiename XYZ"}})

        assert matches == 0
        assert result_bytes == pdf_data

    @patch("src.services.ocr.run_ocrmypdf", side_effect=_noop_ocr)
    def test_multiple_values(self, _mock_ocr) -> None:
        """Multiple distinct values should each be counted."""
        pdf_data = _create_test_pdf_bytes("Max Mustermann und Erika Muster hier.")

        result_bytes, matches = redact_pdf(pdf_data, {0: {"Max Mustermann", "Erika Muster"}})

        assert matches == 2
        assert len(result_bytes) > 0

    def test_empty_dict_passthrough(self) -> None:
        """Empty page_matched_values should return original PDF unchanged."""
        pdf_data = _create_test_pdf_bytes("Test text.")

        result_bytes, matches = redact_pdf(pdf_data, {})

        assert matches == 0
        assert result_bytes == pdf_data

    def test_empty_set_for_page(self) -> None:
        """Page with empty matched_values set should not crash."""
        pdf_data = _create_test_pdf_bytes("Test text.")

        result_bytes, matches = redact_pdf(pdf_data, {0: set()})

        assert matches == 0
        assert result_bytes == pdf_data
