"""Tests for the redactor service — redact_pdf."""

import shutil
from io import BytesIO
from unittest.mock import patch

import pikepdf
import pypdfium2 as pdfium
import pytest

from src.services.ocr import OcrTimeoutError
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

    @patch(
        "src.services.redactor.run_ocrmypdf",
        side_effect=OcrTimeoutError("ocrmypdf exceeded timeout"),
    )
    def test_ocr_timeout_keeps_safely_redacted_pdf(self, _mock_ocr) -> None:
        """OCR timeout must not restore the original unredacted page."""
        pdf_data = _create_test_pdf_bytes("Max Mustermann wohnt in Berlin.")

        result_bytes, matches = redact_pdf(pdf_data, {0: {"Max Mustermann"}})

        assert matches >= 1
        doc = pdfium.PdfDocument(result_bytes)
        page = doc[0]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        textpage.close()
        page.close()
        doc.close()
        assert "Max Mustermann" not in text

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


def _create_pdf_referencing_pii_page(referrer: str, marker: str) -> bytes:
    """Three-page PDF whose last page holds *marker*, kept referenced by *referrer*.

    Replacing a page only rewires ``/Pages``, so anything else still pointing at
    the original page object keeps it — and its unredacted content — in the file.
    """
    pdf = pikepdf.new()
    helvetica = pikepdf.Dictionary(
        Type=pikepdf.Name.Font,
        Subtype=pikepdf.Name.Type1,
        BaseFont=pikepdf.Name.Helvetica,
    )
    for i in range(3):
        pdf.add_blank_page(page_size=(612, 792))
        page = pdf.pages[i]
        text = marker if i == 2 else f"Unauffaelliger Text Seite {i + 1}"
        page[pikepdf.Name.Resources] = pikepdf.Dictionary(Font=pikepdf.Dictionary({"/F1": helvetica}))
        page[pikepdf.Name.Contents] = pdf.make_stream(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode())

    dest = pikepdf.Array([pdf.pages[2].obj, pikepdf.Name.Fit])

    if referrer == "outlines":
        item = pdf.make_indirect(pikepdf.Dictionary(Title=pikepdf.String("Zu Seite 3"), Dest=dest))
        outlines = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Outlines, First=item, Last=item, Count=1))
        item.Parent = outlines
        pdf.Root.Outlines = outlines
    elif referrer == "names":
        pdf.Root.Names = pdf.make_indirect(
            pikepdf.Dictionary(Dests=pikepdf.Dictionary(Names=pikepdf.Array([pikepdf.String("s3"), dest])))
        )
    elif referrer == "legacy_dests":
        pdf.Root.Dests = pdf.make_indirect(pikepdf.Dictionary(s3=dest))
    elif referrer == "link_annot":
        link = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name.Annot,
                Subtype=pikepdf.Name.Link,
                Rect=pikepdf.Array([72, 700, 300, 740]),
                A=pikepdf.Dictionary(S=pikepdf.Name.GoTo, D=dest),
            )
        )
        pdf.pages[0].Annots = pdf.make_indirect(pikepdf.Array([link]))
    else:
        raise ValueError(referrer)

    buf = BytesIO()
    pdf.save(buf)
    pdf.close()
    return buf.getvalue()


class TestNoStalePageContent:
    """Replaced pages must not stay recoverable through other references."""

    MARKER = "Zwischenfall Aktenzeichen 8241"

    @pytest.mark.parametrize("referrer", ["outlines", "names", "legacy_dests", "link_annot"])
    @patch("src.services.redactor.run_ocrmypdf", side_effect=_noop_ocr)
    def test_original_page_content_is_gone(self, _mock_ocr, referrer: str) -> None:
        """No object may carry the pre-redaction text, whoever still points at the page."""
        pdf_data = _create_pdf_referencing_pii_page(referrer, self.MARKER)

        result_bytes, matches = redact_pdf(pdf_data, {2: {self.MARKER}})

        assert matches == 1
        needle = self.MARKER.encode()
        with pikepdf.open(BytesIO(result_bytes)) as out:
            live = {page.obj.objgen for page in out.pages}
            for obj in out.objects:
                try:
                    data = obj.read_bytes()
                except Exception:  # not a stream
                    data = b""
                assert needle not in data, f"stale content in object {obj.objgen}"

                try:
                    is_stale_page = obj.get("/Type") == pikepdf.Name.Page and obj.objgen not in live
                except Exception:  # not a dictionary
                    continue
                if is_stale_page:
                    assert "/Contents" not in obj, f"page {obj.objgen} kept its content stream"
