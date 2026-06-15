"""Adaptive PDF splitting for large documents."""

import asyncio
import io
import logging
from datetime import timedelta

import pypdfium2 as pdfium
from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

from src.config import Config, get_config
from src.services.docling.schemas import SplitPdfForDoclingInput, SplitPdfForDoclingOutput
from src.utils.pdfium_lock import _pdfium_lock

__all__ = [
    "_split_pdf_for_docling",
    "split_pdf_for_docling",
]

logger = logging.getLogger(__name__)


def _split_pdf_sync(pdf_bytes: bytes, file_size_mb: float, cfg: Config) -> SplitPdfForDoclingOutput:
    """Synchronous helper that performs the actual pypdfium2 PDF splitting."""
    with _pdfium_lock:
        pdf = pdfium.PdfDocument(pdf_bytes)
        try:
            num_pages = len(pdf)
            avg_mb_per_page = file_size_mb / max(num_pages, 1)

            logger.info(f"PDF stats: {file_size_mb:.2f}MB, {num_pages} pages, {avg_mb_per_page:.2f} MB/page")

            # Adaptive chunk size: target PDF_TARGET_CHUNK_MB per chunk
            adaptive_size = max(1, int(cfg.PDF_TARGET_CHUNK_MB / avg_mb_per_page))
            chunk_size = min(cfg.PDF_PAGE_CHUNK_SIZE, adaptive_size)

            logger.info(
                f"Splitting PDF into chunks of {chunk_size} pages "
                f"(adaptive={adaptive_size}, cap={cfg.PDF_PAGE_CHUNK_SIZE})"
            )

            chunks: list[bytes] = []
            page_offsets: list[int] = []

            for start_page in range(0, num_pages, chunk_size):
                end_page = min(start_page + chunk_size, num_pages)

                chunk_pdf = pdfium.PdfDocument.new()
                chunk_pdf.import_pages(pdf, pages=range(start_page, end_page))
                buffer = io.BytesIO()
                chunk_pdf.save(buffer, version=17)
                chunk_pdf.close()

                chunk_data = buffer.getvalue()
                if not chunk_data:
                    logger.warning(f"Chunk for pages {start_page}-{end_page - 1} produced empty bytes, skipping")
                    continue
                chunks.append(chunk_data)
                page_offsets.append(start_page)

            if not chunks:
                raise ApplicationError(
                    f"All chunks produced empty bytes from PDF ({num_pages} pages). "
                    f"The PDF may be corrupted or unreadable.",
                    non_retryable=True,
                )

            logger.info(f"Split PDF into {len(chunks)} chunks covering {num_pages} pages")
        finally:
            pdf.close()

    return SplitPdfForDoclingOutput(chunks=chunks, page_offsets=page_offsets)


@activity.defn(name="split_pdf_for_docling")
async def _split_pdf_for_docling(
    input: SplitPdfForDoclingInput,
) -> SplitPdfForDoclingOutput:
    """
    Split large PDF into chunks using pypdfium2 with adaptive sizing.

    Two-phase logic:
    - PDFs < PDF_FORCE_SPLIT_THRESHOLD_MB (40MB default) are never split
    - PDFs >= threshold are always split with adaptive chunk sizing

    Adaptive formula:
        chunk_size = min(PDF_PAGE_CHUNK_SIZE, max(1, int(TARGET / avg_mb_per_page)))

    Args:
        input: SplitPdfForDoclingInput with pdf_bytes and file_size_mb

    Returns:
        SplitPdfForDoclingOutput with list of chunk bytes and page offsets
    """
    cfg = get_config()

    # Fast path: small PDFs never need splitting (unless force_split is requested)
    if not input.force_split and input.file_size_mb < cfg.PDF_FORCE_SPLIT_THRESHOLD_MB:
        activity.logger.info(
            f"PDF size {input.file_size_mb:.2f}MB < {cfg.PDF_FORCE_SPLIT_THRESHOLD_MB}MB, skipping split (fast path)"
        )
        return SplitPdfForDoclingOutput(chunks=[input.pdf_bytes], page_offsets=[0])

    if input.force_split:
        activity.logger.info(f"Force-splitting PDF ({input.file_size_mb:.2f}MB) into chunks as fallback")

    return await asyncio.to_thread(_split_pdf_sync, input.pdf_bytes, input.file_size_mb, cfg)


async def split_pdf_for_docling(
    pdf_bytes: bytes,
    file_size_mb: float,
    *,
    force_split: bool = False,
) -> SplitPdfForDoclingOutput:
    """Workflow wrapper for split_pdf_for_docling activity."""
    return await workflow.execute_activity(
        _split_pdf_for_docling,
        SplitPdfForDoclingInput(pdf_bytes=pdf_bytes, file_size_mb=file_size_mb, force_split=force_split),
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
