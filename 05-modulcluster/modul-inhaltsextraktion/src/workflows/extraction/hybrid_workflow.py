"""Hybrid Temporal Execution Script for PDF Extraction.

This module defines the HybridExtractionWorkflow, which intelligently evaluates
whether to perform pure OCR (Light ON OCR) extraction, Docling extraction, or
a hybrid combination of both. The decision is dynamically based on the scan
status of the PDF pages.
"""

import asyncio
from pathlib import Path
from uuid import UUID

from temporalio import workflow

from src.activities.hybrid_extraction import split_pdf_by_scan_status
from src.activities.light_on_ocr.light_on_ocr import extract_markdown, prepare_pdf_page_images
from src.config import snapshot_config
from src.services.docling.chunk_extraction import combine_docling_chunks
from src.services.docling.orchestrator import _extract_all_chunks
from src.services.docling.pdf_compression import compress_pdf_images
from src.services.docling.pdf_preparation import _sanitize_stem, download_and_prepare_pdf
from src.services.docling.schemas import DoclingActivityInput
from src.services.docling.pdf_splitting import split_pdf_for_docling
from src.workflows.extraction.types import HybridExtractionWorkflowInput, HybridExtractionWorkflowOutput

hybrid_extraction_workflow_id = "hybrid-extraction"


@workflow.defn(name=hybrid_extraction_workflow_id)
class HybridExtractionWorkflow:
    """Hybrid PDF extraction workflow utilizing Docling and Light ON OCR.

    This workflow processes a PDF by evaluating whether its pages are scanned
    or natively digital. It routes scanned pages to Light ON OCR and digital
    pages to Docling, supporting a fully hybrid extraction pipeline within a
    single document.
    """

    @workflow.run
    async def run(self, input: HybridExtractionWorkflowInput) -> HybridExtractionWorkflowOutput:
        """Executes the hybrid extraction process for a given PDF.

        Args:
            input (HybridExtractionWorkflowInput): The input arguments containing
                project ID and file information.

        Returns:
            HybridExtractionOutput: The final combined markdown extracted from the PDF.
        """
        cfg = snapshot_config()
        filename = input.file_info.filename
        project_id = input.project_id

        workflow.logger.info(f"Starting hybrid extraction for project: {project_id}, file: {filename}")

        # Step 1: Download and prepare the target PDF
        prepared = await download_and_prepare_pdf(DoclingActivityInput(file_info=input.file_info, project_id=input.project_id))
        pdf_bytes = prepared.pdf_bytes

        # Step 2: Analyze scan status and split PDF accordingly
        split_output = await split_pdf_by_scan_status(file_bytes=pdf_bytes)
        workflow.logger.info(f"Scan status analysis complete. split output: {split_output.is_scanned}")

        pdf_chunks = split_output.pdf_chunks
        scan_statuses = split_output.is_scanned
        page_offsets = split_output.page_offsets

        # Step 3: Initialize semaphores for concurrency control
        ocr_extraction_semaphore = asyncio.Semaphore(cfg.HYBRID_EXTRACTION_OCR_CONCURRENCY)
        docling_extraction_semaphore = asyncio.Semaphore(cfg.HYBRID_EXTRACTION_DOCLING_CONCURRENCY)

        # Step 4: Route chunks to appropriate extraction service
        extraction_tasks = []
        for pdf_chunk, scan_status, page_offset in zip(pdf_chunks, scan_statuses, page_offsets, strict=True):
            if scan_status:
                extraction_tasks.append(self.run_ocr_extraction(pdf_chunk, page_offset, ocr_extraction_semaphore))
            else:
                extraction_tasks.append(
                    self.run_docling_extraction(
                        pdf_chunk, filename, project_id, page_offset, docling_extraction_semaphore
                    )
                )

        # Step 5: Execute extractions in parallel and combine results
        markdown = "".join(await asyncio.gather(*extraction_tasks))

        workflow.logger.info("Hybrid extraction completed successfully.")
        return HybridExtractionWorkflowOutput(markdown=markdown)

    async def run_docling_extraction(
        self,
        file_bytes: bytes,
        filename: str,
        project_id: UUID,
        base_page_offset: int,
        semaphore: asyncio.Semaphore,
    ) -> str:
        """Executes the Docling extraction pipeline for digital PDF chunks.

        Args:
            file_bytes (bytes): The raw bytes of the PDF chunk.
            filename (str): The original filename.
            project_id (UUID): The unique identifier of the project.
            base_page_offset (int): The starting page number offset for the chunk.
            semaphore (asyncio.Semaphore): Concurrency limit semaphore.

        Returns:
            str: The sanitized markdown text extracted by Docling.
        """
        workflow.logger.info(f"Starting Docling extraction at offset {base_page_offset}")
        async with semaphore:
            file_size_mb = len(file_bytes) / (1024 * 1024)
            stem = _sanitize_stem(Path(filename).stem)

            # Step 1: Compress embedded images to reduce memory pressure
            compression_result = await compress_pdf_images(file_bytes, file_size_mb)
            pdf_bytes = compression_result.pdf_bytes
            file_size_mb = compression_result.file_size_mb

            # Step 2: Split PDF into chunks (if large) with adaptive sizing
            split_result = await split_pdf_for_docling(pdf_bytes, file_size_mb)
            pdf_chunks = split_result.chunks
            page_offsets = split_result.page_offsets
            page_offsets = [page_offset + base_page_offset for page_offset in page_offsets]

            # Step 3: Process chunks with Docling in parallel
            chunk_results = await _extract_all_chunks(
                pdf_chunks=pdf_chunks,
                page_offsets=page_offsets,
                stem=stem,
                filename=filename,
                project_id=project_id,
                skip_dms=True,
            )

            # Step 4: Combine all chunks and sanitize the final markdown
            combined = await combine_docling_chunks(
                chunk_results,
                project_id=project_id,
                filename=filename,
            )

            workflow.logger.info(f"Docling extraction completed for offset {base_page_offset}")
            return combined.md_content

    async def run_ocr_extraction(
        self,
        file_bytes: bytes,
        base_page_offset: int,
        semaphore: asyncio.Semaphore,
    ) -> str:
        """Executes the Light ON OCR extraction pipeline for scanned PDF chunks.

        Args:
            file_bytes (bytes): The raw bytes of the PDF chunk.
            base_page_offset (int): The starting page number offset for the chunk.
            semaphore (asyncio.Semaphore): Concurrency limit semaphore.

        Returns:
            str: The extracted markdown text with injected XML-style page numbers.
        """
        workflow.logger.info(f"Starting Light ON OCR extraction at offset {base_page_offset}")

        # Step 1: Prepare PDF page images as base64 strings
        page_images_b64_res = await prepare_pdf_page_images(file_bytes)
        page_images_b64 = page_images_b64_res.page_images_b64

        async def extract_from_pdf_image(b64: str) -> str:
            async with semaphore:
                return await extract_markdown(b64)

        # Step 2: Execute OCR extraction on all images concurrently
        image_extraction_tasks = [extract_from_pdf_image(b64) for b64 in page_images_b64]
        pages_markdown = await asyncio.gather(*image_extraction_tasks)

        # Step 3: Reconstruct markdown with injected page markers
        combined_ocr_markdown = "".join(
            f'\n<seite nummer="{base_page_offset + md_page_idx + 1}" />\n' + md
            for md_page_idx, md in enumerate(pages_markdown)
        )

        workflow.logger.info(f"Light ON OCR extraction completed for offset {base_page_offset}")
        return combined_ocr_markdown
