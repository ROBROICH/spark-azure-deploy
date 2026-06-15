"""Tests for the Temporal redaction activities."""

import shutil
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pikepdf
import pypdfium2 as pdfium
import pytest

from src.activities.redaction_activities import apply_redactions, detect_pii_presidio
from src.models.schemas import (
    ApplyRedactionsInput,
    DetectPiiPresidioInput,
    PageTextData,
)


def _create_test_pdf_bytes(text: str = "Max Mustermann wohnt in Berlin.") -> bytes:
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


class TestApplyRedactionsActivity:
    """Test the in-memory apply_redactions activity."""

    @pytest.fixture(autouse=True)
    def _mock_activity_context(self):
        """Mock Temporal's activity.heartbeat so tests can call activities directly."""
        with patch("src.activities.redaction_activities.activity.heartbeat"):
            yield

    @patch("src.services.ocr.run_ocrmypdf", side_effect=_noop_ocr)
    def test_redacts_pii_terms(self, _mock_ocr) -> None:
        """PII terms should be redacted from the PDF."""
        pdf_data = _create_test_pdf_bytes("Max Mustermann wohnt in Berlin.")
        inp = ApplyRedactionsInput(
            pdf_data=pdf_data,
            pii_terms=["Max Mustermann"],
        )

        result = apply_redactions(inp)

        assert result.pages_processed == 1
        assert result.matches_found >= 1
        assert result.error_pages == []
        # Verify the output is a valid PDF
        doc = pdfium.PdfDocument(result.redacted_pdf)
        assert len(doc) == 1
        # After rasterization, the original text should not be searchable
        page = doc[0]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        assert "Max Mustermann" not in text
        textpage.close()
        page.close()
        doc.close()

    def test_no_pii_passthrough(self) -> None:
        """Without PII terms, PDF should pass through unchanged."""
        pdf_data = _create_test_pdf_bytes("Kein personenbezogener Inhalt.")
        inp = ApplyRedactionsInput(
            pdf_data=pdf_data,
            pii_terms=[],
        )

        result = apply_redactions(inp)

        assert result.pages_processed == 1
        assert result.matches_found == 0
        assert result.error_pages == []
        assert len(result.redacted_pdf) > 0

    def test_error_token_counted(self) -> None:
        """Error tokens should record error page but not crash."""
        pdf_data = _create_test_pdf_bytes("Irgendein Text.")
        inp = ApplyRedactionsInput(
            pdf_data=pdf_data,
            pii_terms=[],
            error_pages=[0],
        )

        result = apply_redactions(inp)

        assert result.error_pages == [0]
        assert result.matches_found == 0


class TestDetectPiiPresidioActivity:
    """Test the Presidio detection activity with a mocked detector."""

    @pytest.fixture(autouse=True)
    def _mock_activity_context(self):
        """Mock Temporal's activity.heartbeat so tests can call activities directly."""
        with patch("src.activities.redaction_activities.activity.heartbeat"):
            yield

    def test_returns_terms_per_page(self) -> None:
        """Activity should call the detector once per page and preserve page numbers."""
        inp = DetectPiiPresidioInput(
            pages=[
                PageTextData(page_number=0, page_lines=["Max Mustermann"]),
                PageTextData(page_number=1, page_lines=["Berlin"]),
            ]
        )

        with (
            patch(
                "src.activities.redaction_activities.detect_pii_in_lines",
                side_effect=[["Max Mustermann"], ["Berlin"]],
            ) as mock_detect,
            patch("src.activities.redaction_activities.activity.heartbeat"),
        ):
            result = detect_pii_presidio(inp)

        assert mock_detect.call_count == 2
        assert [p.page_number for p in result.page_pii] == [0, 1]
        assert result.page_pii[0].pii_terms == ["Max Mustermann"]
        assert result.page_pii[1].pii_terms == ["Berlin"]

    def test_empty_pages_handled(self) -> None:
        """Empty input should produce empty result without errors."""
        result = detect_pii_presidio(DetectPiiPresidioInput(pages=[]))
        assert result.page_pii == []
