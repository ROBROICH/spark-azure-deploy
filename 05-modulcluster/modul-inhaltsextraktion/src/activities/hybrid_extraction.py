"""PDF Scan Status Splitting Activity.

This module provides the schemas, helper functions, and Temporal activities
required to analyze a PDF, determine whether individual pages are natively
digital or scanned, and split the document into continuous chunks based
on this scan status.
"""

import io
from datetime import timedelta

import pypdfium2 as pdfium
from pydantic import BaseModel
from temporal import Base64Bytes
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config


class SplitPDFScannedInput(BaseModel):
    """Input schema for the scan status splitting activity.

    Attributes:
        file_bytes (Base64Bytes): The raw bytes of the source PDF, encoded
            for safe Temporal payload serialization.
    """

    file_bytes: Base64Bytes


class SplitPDFScannedOutput(BaseModel):
    """Output schema for the scan status splitting activity.

    Attributes:
        pdf_chunks (list[Base64Bytes]): A list containing the raw bytes of each
            newly generated PDF chunk.
        is_scanned (list[bool]): A list indicating whether the corresponding
            chunk in `pdf_chunks` is considered scanned (True) or natively
            digital (False).
        page_offsets (list[int]): A list representing the starting page index
            (0-based) in the original document for each chunk.
    """

    pdf_chunks: list[Base64Bytes]
    is_scanned: list[bool]
    page_offsets: list[int]


@activity.defn(name="split_pdf_by_scan_status")
async def _split_pdf_by_scan_status(input: SplitPDFScannedInput) -> SplitPDFScannedOutput:
    """Splits a PDF into chunks based on consecutive page scan statuses."""
    activity.logger.debug(f"Starting PDF split by scan status activity for len{input.file_bytes}.")

    # Step 1: Load the source document
    src_pdf = pdfium.PdfDocument(input.file_bytes)
    num_pages = len(src_pdf)
    activity.logger.debug(f"Loaded document with {num_pages} pages.")

    if num_pages == 0:
        return SplitPDFScannedOutput(pdf_chunks=[], is_scanned=[], page_offsets=[])

    # Step 2: Iterate pages and group consecutive statuses
    chunks = []
    current_chunk_pages: list[int] = []
    current_chunk_status = None

    for page_index in range(num_pages):
        page = src_pdf[page_index]
        text_page = page.get_textpage()
        text = text_page.get_text_range()
        is_scanned = not bool(text and len(text.strip()) > 10)

        if current_chunk_status is None:
            current_chunk_status = is_scanned
            current_chunk_pages.append(page_index)
        elif current_chunk_status == is_scanned:
            current_chunk_pages.append(page_index)
        else:
            chunks.append((current_chunk_status, current_chunk_pages))
            current_chunk_status = is_scanned
            current_chunk_pages = [page_index]

    if current_chunk_pages:
        chunks.append((current_chunk_status, current_chunk_pages))

    activity.logger.debug(f"Identified {len(chunks)} continuous status chunks.")

    # Step 3: Extract grouped pages into new PDF documents
    pdf_chunks_bytes = []
    is_scanned_flags = []
    page_offsets = []

    for status, page_indices in chunks:
        new_pdf = pdfium.PdfDocument.new()
        new_pdf.import_pages(src_pdf, page_indices)

        pdf_buffer = io.BytesIO()
        new_pdf.save(pdf_buffer)

        pdf_chunks_bytes.append(pdf_buffer.getvalue())
        is_scanned_flags.append(status)
        page_offsets.append(page_indices[0])

    activity.logger.debug("Successfully generated new PDF chunk binaries.")
    return SplitPDFScannedOutput(pdf_chunks=pdf_chunks_bytes, is_scanned=is_scanned_flags, page_offsets=page_offsets)


async def split_pdf_by_scan_status(file_bytes: bytes) -> SplitPDFScannedOutput:
    """Workflow wrapper for executing the PDF split activity."""
    return await workflow.execute_activity(
        _split_pdf_by_scan_status,
        SplitPDFScannedInput(file_bytes=file_bytes),
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PREPROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
