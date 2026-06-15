"""Download and prepare PDF from DMS for Docling extraction."""

from datetime import timedelta

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.processors.preprocessor import NotValidPdfError, Preprocessor
from src.services.docling.schemas import DoclingActivityInput, PreparedPdfOutput
from src.utils.dms_utils import download_file

__all__ = [
    "_download_and_prepare_pdf",
    "_sanitize_stem",
    "download_and_prepare_pdf",
]


def _sanitize_stem(stem: str) -> str:
    """
    Sanitize stem to handle problematic Unicode characters from DMS filenames.

    DMS filenames may contain decomposed Unicode (U + combining diaeresis instead of U)
    or invisible line separators (U+2028, U+2029) that corrupt filenames.
    """
    import unicodedata

    original_stem = stem
    stem = unicodedata.normalize("NFC", stem)  # Compose decomposed chars
    # Remove control chars, format chars, and line/paragraph separators
    stem = "".join(c for c in stem if unicodedata.category(c) not in {"Cc", "Cf", "Zl", "Zp"} or c in (" ", "\t"))
    stem = stem.replace("\u2028", "_").replace("\u2029", "_")
    stem = stem.replace("\n", "_").replace("\r", "_")
    if stem != original_stem:
        activity.logger.info(f"Sanitized stem: {len(original_stem)} -> {len(stem)} chars")
    return stem


@activity.defn(name="download_and_prepare_pdf_docling")
async def _download_and_prepare_pdf(input: DoclingActivityInput) -> PreparedPdfOutput:
    """
    Download file from DMS and convert to PDF if needed.

    This activity handles:
    - DMS download using file_id
    - PDF validation
    - Conversion of non-PDF documents (via LibreOffice/unoserver)

    Args:
        input: DoclingActivityInput with file_info and project_id

    Returns:
        PreparedPdfOutput with PDF bytes, filename, and size
    """
    filename = input.file_info.filename
    activity.logger.info(f"Downloading and preparing PDF: {filename}")

    # Download file from DMS
    file_bytes = await download_file(input.file_info.file_id)
    activity.logger.info(f"Downloaded {len(file_bytes)} bytes from DMS")

    # Validate and convert if needed
    try:
        await Preprocessor.validate_pdf(file_bytes)
        pdf_bytes = file_bytes
    except NotValidPdfError:
        activity.logger.info(f"Not a valid PDF, converting: {filename}")
        pdf_bytes, filename = await Preprocessor.convert_to_pdf_if_needed(filename, file_bytes)

    file_size_mb = len(pdf_bytes) / (1024 * 1024)
    activity.logger.info(f"PDF prepared: {filename} ({file_size_mb:.2f} MB)")

    return PreparedPdfOutput(
        pdf_bytes=pdf_bytes,
        filename=filename,
        file_size_mb=file_size_mb,
    )


async def download_and_prepare_pdf(input: DoclingActivityInput) -> PreparedPdfOutput:
    """Workflow wrapper for download_and_prepare_pdf activity."""
    return await workflow.execute_activity(
        _download_and_prepare_pdf,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_STORAGE_ACTIVITY_MAX_ATTEMPTS,
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(seconds=60),
        ),
    )
