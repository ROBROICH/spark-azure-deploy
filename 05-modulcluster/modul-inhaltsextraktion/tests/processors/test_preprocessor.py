"""Tests for the Preprocessor PDF conversion logic."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.processors.preprocessor import NotValidPdfError, Preprocessor

VALID_PDF_BYTES = (
    b"%PDF-1.1\n"
    b"1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n"
    b"2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n"
    b"3 0 obj\n<</Type/Page/MediaBox[0 0 1 1]>>\nendobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000058 00000 n \n0000000111 00000 n \n"
    b"trailer\n<</Size 4/Root 1 0 R>>\n"
    b"startxref\n149\n%%EOF"
)


@pytest.mark.asyncio
async def test_convert_to_pdf_returns_original_bytes_with_existing_pdf() -> None:
    """Returns the original bytes and filename when input is already a valid PDF."""
    result_bytes, result_filename = await Preprocessor.convert_to_pdf_if_needed("document.pdf", VALID_PDF_BYTES)
    assert result_bytes == VALID_PDF_BYTES
    assert result_filename == "document.pdf"


@pytest.mark.asyncio
async def test_convert_to_pdf_returns_pdf_bytes_with_non_pdf_input() -> None:
    """Returns PDF bytes and a .pdf filename when input is not a PDF."""
    env = SimpleNamespace(UNO_HOST="uno", UNO_PORT=2002, UNO_PROTOCOL="http")
    with (
        patch("src.processors.preprocessor.ENV", env),
        patch("src.processors.preprocessor.UnoClient") as mock_uno_client,
        patch("src.processors.preprocessor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
    ):
        mock_client = MagicMock()
        mock_uno_client.return_value = mock_client

        def _side_effect(func, *args, **kwargs):
            """Return valid PDF bytes when the convert function is called."""
            if func is mock_client.convert:
                return VALID_PDF_BYTES
            return func(*args, **kwargs)

        mock_to_thread.side_effect = _side_effect

        result_bytes, result_filename = await Preprocessor.convert_to_pdf_if_needed("document.docx", b"word content")

        assert result_bytes == VALID_PDF_BYTES
        assert result_filename == "document.pdf"
        mock_uno_client.assert_called_once_with(
            server="uno",
            port="2002",
            host_location="remote",
            protocol="http",
        )
        mock_to_thread.assert_any_await(
            mock_client.convert,
            indata=b"word content",
            outpath=None,
            convert_to="pdf",
        )


@pytest.mark.asyncio
async def test_convert_to_pdf_raises_value_error_with_invalid_pdf_output() -> None:
    """Raises NotValidPdfError when converted output is not a valid PDF."""
    env = SimpleNamespace(UNO_HOST="uno", UNO_PORT=2002, UNO_PROTOCOL="http")
    with (
        patch("src.processors.preprocessor.ENV", env),
        patch("src.processors.preprocessor.UnoClient") as mock_uno_client,
        patch("src.processors.preprocessor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
    ):
        mock_client = MagicMock()
        mock_uno_client.return_value = mock_client

        def _side_effect(func, *args, **kwargs):
            """Return invalid PDF bytes when the convert function is called."""
            if func is mock_client.convert:
                return b"not a pdf"
            return func(*args, **kwargs)

        mock_to_thread.side_effect = _side_effect

        with pytest.raises(NotValidPdfError):
            await Preprocessor.convert_to_pdf_if_needed("document.docx", b"word content")
