"""LibreOffice-backed DOCX conversion helpers."""

from __future__ import annotations

import logging
from typing import Protocol, cast

from unoserver.client import UnoClient  # type: ignore

from src.config.settings import settings

logger = logging.getLogger(__name__)

_DOCX_CONVERT_TO = "docx"
_PDF_CONVERT_TO = "pdf"


class _UnoClientProtocol(Protocol):
    """Minimal protocol required from the UNO client."""

    def convert(
        self,
        *,
        indata: bytes,
        outpath: None,
        convert_to: str,
    ) -> bytes | None: ...


class UnoConversionError(RuntimeError):
    """Raised when LibreOffice conversion fails or returns invalid output."""


def refresh_docx_with_unoserver(docx_bytes: bytes) -> bytes:
    """Rewrite a DOCX document through LibreOffice."""
    return _convert_docx_with_unoserver(
        docx_bytes,
        convert_to=_DOCX_CONVERT_TO,
        failure_message="LibreOffice DOCX conversion failed",
        empty_output_message="LibreOffice returned empty DOCX output",
    )


def convert_docx_to_pdf_with_unoserver(docx_bytes: bytes) -> bytes:
    """Convert generated DOCX bytes to PDF through LibreOffice."""
    return _convert_docx_with_unoserver(
        docx_bytes,
        convert_to=_PDF_CONVERT_TO,
        failure_message="LibreOffice PDF conversion failed",
        empty_output_message="LibreOffice returned empty PDF output",
    )


def _convert_docx_with_unoserver(
    docx_bytes: bytes,
    *,
    convert_to: str,
    failure_message: str,
    empty_output_message: str,
) -> bytes:
    """Convert DOCX bytes through LibreOffice using the requested output format."""
    if not docx_bytes:
        raise UnoConversionError("Generated DOCX is empty before LibreOffice conversion")

    client = cast(
        _UnoClientProtocol,
        UnoClient(
            server=settings.UNO_HOST,
            port=str(settings.UNO_PORT),
            host_location="remote",
            protocol=settings.UNO_PROTOCOL,
        ),
    )

    try:
        converted_bytes = client.convert(
            indata=docx_bytes,
            outpath=None,
            convert_to=convert_to,
        )
    except Exception as err:
        logger.exception("LibreOffice conversion failed for %s output", convert_to)
        raise UnoConversionError(failure_message) from err

    if not converted_bytes:
        raise UnoConversionError(empty_output_message)

    return converted_bytes
