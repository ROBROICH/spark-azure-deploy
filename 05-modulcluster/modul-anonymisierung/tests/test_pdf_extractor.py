"""Tests for PDF text extraction with OCR fallback (single-pass)."""

import shutil
import subprocess
from unittest.mock import MagicMock, patch

import pikepdf
import pytest

from src.services.ocr import OcrTimeoutError, run_ocrmypdf
from src.services.pdf_extractor import extract_all_texts


def _create_text_pdf(path: str, text: str = "Test text content") -> None:
    """Create a minimal single-page PDF with searchable text at the given path."""
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

    pdf.save(path)


def _create_blank_pdf(path: str) -> None:
    """Create a PDF with a blank page (no text content)."""
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    pdf.save(path)


class TestExtractAllTexts:
    """Tests for extract_all_texts (single-pass OCR)."""

    def test_returns_lines_when_text_present(self, tmp_path) -> None:
        """Non-empty pages return lines without triggering OCR."""
        pdf_path = str(tmp_path / "test.pdf")
        _create_text_pdf(pdf_path, "Line A Line B")

        page_lines_list, enriched = extract_all_texts(pdf_path)

        assert len(page_lines_list) == 1
        full_text = "\n".join(page_lines_list[0])
        assert "Line A" in full_text
        assert "Line B" in full_text
        # No OCR needed — enriched bytes should equal original
        with open(pdf_path, "rb") as f:
            assert enriched == f.read()

    @patch("src.services.pdf_extractor._run_ocr_to_bytes")
    def test_triggers_ocr_when_empty(self, mock_run_ocr, tmp_path) -> None:
        """Empty page triggers single-pass OCR."""
        pdf_path = str(tmp_path / "blank.pdf")
        _create_blank_pdf(pdf_path)

        # _run_ocr_to_bytes returns a PDF with text — use the blank PDF as stand-in
        text_pdf_path = str(tmp_path / "ocr_result.pdf")
        _create_text_pdf(text_pdf_path, "OCR result")
        with open(text_pdf_path, "rb") as f:
            mock_run_ocr.return_value = f.read()

        page_lines_list, enriched = extract_all_texts(pdf_path)

        assert len(page_lines_list) == 1
        full_text = "\n".join(page_lines_list[0])
        assert "OCR result" in full_text
        mock_run_ocr.assert_called_once_with(pdf_path, [0], "deu")

    @patch("src.services.pdf_extractor._run_ocr_to_bytes", side_effect=RuntimeError("OCR boom"))
    def test_ocr_failure_is_propagated(self, _mock_ocr, tmp_path) -> None:
        """OCR failure aborts extraction instead of returning unprocessed pages."""
        pdf_path = str(tmp_path / "blank.pdf")
        _create_blank_pdf(pdf_path)

        with pytest.raises(RuntimeError, match="OCR boom"):
            extract_all_texts(pdf_path)


class TestRunOcrmypdf:
    """Tests for run_ocrmypdf (subprocess-based OCR)."""

    def test_ocr_success(self, tmp_path) -> None:
        """Successful OCR writes output file."""
        pdf_path = str(tmp_path / "test.pdf")
        _create_text_pdf(pdf_path, "OCR result text")
        output_path = tmp_path / "output.pdf"

        def fake_ocr_subprocess(args, **kwargs):
            shutil.copy(args[-2], args[-1])
            return MagicMock(returncode=0)

        with (
            patch("src.services.ocr.shutil.which", return_value="/usr/bin/ocrmypdf"),
            patch("src.services.ocr.subprocess.run", side_effect=fake_ocr_subprocess) as mock_run,
            patch("src.services.ocr.ENV.OCR_TIMEOUT_SECONDS", 321),
        ):
            run_ocrmypdf(pdf_path, output_path, [0])

        assert output_path.exists()
        assert output_path.stat().st_size > 0
        assert mock_run.call_args.kwargs["timeout"] == 321

    def test_ocr_binary_not_found(self, tmp_path) -> None:
        """Missing ocrmypdf binary raises FileNotFoundError."""
        pdf_path = str(tmp_path / "test.pdf")
        _create_text_pdf(pdf_path)

        with patch("src.services.ocr.shutil.which", return_value=None):
            with pytest.raises(FileNotFoundError, match="ocrmypdf not found"):
                run_ocrmypdf(pdf_path, tmp_path / "out.pdf", [0])

    def test_ocr_subprocess_failure(self, tmp_path) -> None:
        """Non-zero exit code (not 0 or 4) from ocrmypdf raises RuntimeError."""
        pdf_path = str(tmp_path / "test.pdf")
        _create_text_pdf(pdf_path)

        with (
            patch("src.services.ocr.shutil.which", return_value="/usr/bin/ocrmypdf"),
            patch(
                "src.services.ocr.subprocess.run",
                return_value=MagicMock(returncode=1, stderr="OCR failed"),
            ),
        ):
            with pytest.raises(RuntimeError, match="ocrmypdf exited with 1"):
                run_ocrmypdf(pdf_path, tmp_path / "out.pdf", [0])

    def test_ocr_subprocess_timeout(self, tmp_path) -> None:
        """A hanging OCR process is aborted after the configured timeout."""
        pdf_path = str(tmp_path / "test.pdf")
        _create_text_pdf(pdf_path)

        with (
            patch("src.services.ocr.shutil.which", return_value="/usr/bin/ocrmypdf"),
            patch("src.services.ocr.ENV.OCR_TIMEOUT_SECONDS", 321),
            patch(
                "src.services.ocr.subprocess.run",
                side_effect=subprocess.TimeoutExpired("ocrmypdf", 321),
            ),
            pytest.raises(OcrTimeoutError, match="exceeded timeout of 321 seconds"),
        ):
            run_ocrmypdf(pdf_path, tmp_path / "out.pdf", [0])
