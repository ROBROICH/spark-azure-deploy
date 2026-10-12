"""Pipeline coordination for Docling PDF extraction."""

import asyncio
from datetime import timedelta
from pathlib import Path
from uuid import UUID

from temporalio import workflow
from temporalio.exceptions import ActivityError
from temporalio.exceptions import TimeoutError as TemporalTimeoutError

from src.config import Config, get_config
from src.schemas import ExtractionOutput
from src.services.docling.chunk_extraction import (
    combine_docling_chunks,
    deduplicate_images,
    submit_chunk_to_docling,
    wait_for_docling_result,
)
from src.services.docling.pdf_compression import compress_pdf_images
from src.services.docling.pdf_preparation import _sanitize_stem, download_and_prepare_pdf
from src.services.docling.pdf_rasterization import rasterize_chunk
from src.services.docling.pdf_splitting import split_pdf_for_docling
from src.services.docling.plan_extraction import collect_metrics, is_plan_document
from src.services.docling.schemas import DoclingActivityInput, DoclingChunkResult

__all__ = [
    "_is_timeout_failure",
    "extract_docling_chunk",
    "process_pdf_with_docling",
]


def _is_timeout_failure(exc: BaseException) -> bool:
    """Check if an exception represents a Temporal activity timeout.

    Temporal wraps activity timeouts as ActivityError whose .cause is a
    TemporalTimeoutError.  Detecting these lets us skip the raster fallback
    for chunks that timed out — rasterizing won't help if the document is
    simply too large for docling-serve to handle in time.
    """
    return isinstance(exc, ActivityError) and isinstance(exc.cause, TemporalTimeoutError)


async def extract_docling_chunk(
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
    page_offset: int,
    output_prefix: str,
    filename: str,
    project_id: UUID | None = None,
    skip_dms: bool = False,
    max_resubmit_attempts: int = 3,
) -> DoclingChunkResult:
    """Extract a single PDF chunk via docling with durable task_id tracking.

    Workflow-level function (runs on workflow thread) that:
    1. Submits the chunk to docling (fast activity, returns task_id)
    2. Polls + post-processes (long activity, returns result or task_not_found)
    3. On task_not_found (pod restart), re-submits up to max_resubmit_attempts times

    Args:
        max_resubmit_attempts: Passed from caller (snapshot_config) to avoid
            reading config on the workflow thread during replay.

    Note: Worst-case activity executions per chunk is
    max_resubmit_attempts × (submit retries + wait retries) — e.g. 3 × (2+2) = 12.
    With 30 min wait timeout, worst-case wall time is ~90 min per chunk.
    """
    from temporalio.exceptions import ApplicationError

    for attempt in range(1, max_resubmit_attempts + 1):
        submit_result = await submit_chunk_to_docling(
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            filename=filename,
        )

        wait_result = await wait_for_docling_result(
            task_id=submit_result.task_id,
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            page_offset=page_offset,
            output_prefix=output_prefix,
            filename=filename,
            project_id=project_id,
            skip_dms=skip_dms,
        )

        if not wait_result.task_not_found:
            if wait_result.result is None:
                raise ApplicationError(
                    f"Chunk {chunk_index + 1}: wait activity returned success but result is None",
                    non_retryable=True,
                )
            return wait_result.result

        # Task lost — re-submit
        workflow.logger.warning(
            f"Chunk {chunk_index + 1}: task {submit_result.task_id} lost "
            f"(attempt {attempt}/{max_resubmit_attempts}), re-submitting"
        )
        if attempt < max_resubmit_attempts:
            await workflow.sleep(timedelta(seconds=10))

    raise ApplicationError(
        f"Chunk {chunk_index + 1}: docling task lost {max_resubmit_attempts} times, giving up",
        non_retryable=True,
    )


async def _extract_all_chunks(
    pdf_chunks: list[bytes],
    page_offsets: list[int],
    stem: str,
    filename: str,
    project_id: UUID | None,
    skip_dms: bool = False,
) -> list[DoclingChunkResult]:
    """Extract all PDF chunks with parallel execution, sequential retry, and raster fallback.

    Returns sorted list of successful results. Raises if all chunks fail.
    """
    from temporalio.exceptions import ApplicationError

    cfg = get_config()
    total_chunks = len(pdf_chunks)
    extraction_semaphore = asyncio.Semaphore(cfg.EXTRACTION_CHUNK_CONCURRENCY)

    max_resubmit = cfg.DOCLING_MAX_RESUBMIT_ATTEMPTS

    async def _extract_one(i: int, chunk_content: bytes, page_offset: int) -> DoclingChunkResult:
        """Extract a single PDF chunk through docling with semaphore gating."""
        async with extraction_semaphore:
            return await extract_docling_chunk(
                chunk_bytes=chunk_content,
                chunk_index=i,
                total_chunks=total_chunks,
                page_offset=page_offset,
                output_prefix=stem,
                filename=filename,
                project_id=project_id,
                skip_dms=skip_dms,
                max_resubmit_attempts=max_resubmit,
            )

    # Phase 1: Try all chunks, collecting exceptions
    raw_results = await asyncio.gather(
        *[_extract_one(i, c, p) for i, (c, p) in enumerate(zip(pdf_chunks, page_offsets, strict=False))],
        return_exceptions=True,
    )

    chunk_results: list[DoclingChunkResult] = []
    failed_indices: list[int] = []
    timeout_indices: set[int] = set()

    for i, result in enumerate(raw_results):
        if isinstance(result, BaseException):
            workflow.logger.warning(f"Chunk {i + 1}/{total_chunks} failed: {result}")
            failed_indices.append(i)
            if _is_timeout_failure(result):
                timeout_indices.add(i)
        else:
            chunk_results.append(result)

    # Phase 2: Sequential retry of non-timeout failures
    retryable_indices = [i for i in failed_indices if i not in timeout_indices]
    if retryable_indices and cfg.EXTRACTION_CHUNK_CONCURRENCY > 1:
        workflow.logger.info(
            f"Retrying {len(retryable_indices)} failed chunk(s) sequentially "
            f"(was concurrent at N={cfg.EXTRACTION_CHUNK_CONCURRENCY})"
        )
        for i in retryable_indices:
            try:
                workflow.logger.info(f"Retrying chunk {i + 1}/{total_chunks} sequentially (waiting 10s)")
                await workflow.sleep(timedelta(seconds=10))
                retry_result = await extract_docling_chunk(
                    chunk_bytes=pdf_chunks[i],
                    chunk_index=i,
                    total_chunks=total_chunks,
                    page_offset=page_offsets[i],
                    output_prefix=stem,
                    filename=filename,
                    project_id=project_id,
                    max_resubmit_attempts=max_resubmit,
                )
                chunk_results.append(retry_result)
                failed_indices.remove(i)
                workflow.logger.info(f"Sequential retry succeeded for chunk {i + 1}")
            except Exception as retry_err:
                workflow.logger.warning(f"Sequential retry also failed for chunk {i + 1}: {retry_err}")

    # Phase 3: Split fallback — split failed chunks into sub-chunks and retry.
    # Runs before raster because splitting preserves original content and avoids
    # the massive file size blowup that rasterization causes on large documents.
    if failed_indices:
        await _split_fallback_for_chunks(
            failed_indices,
            pdf_chunks,
            page_offsets,
            stem,
            filename,
            project_id,
            cfg,
            chunk_results,
        )

    # Phase 4: Raster fallback for still-failed chunks
    if failed_indices and cfg.ENABLE_RASTER_FALLBACK:
        await _raster_fallback_for_chunks(
            failed_indices,
            timeout_indices,
            pdf_chunks,
            page_offsets,
            total_chunks,
            stem,
            filename,
            project_id,
            cfg,
            chunk_results,
        )
    elif failed_indices:
        workflow.logger.warning(f"Raster fallback disabled, skipping {len(failed_indices)} failed chunk(s)")

    if not chunk_results:
        raise ApplicationError(
            f"All {total_chunks} chunk(s) failed extraction (including fallbacks). Cannot produce output.",
            non_retryable=True,
        )
    if len(chunk_results) < total_chunks:
        workflow.logger.warning(
            f"Partial extraction: {len(chunk_results)}/{total_chunks} chunks succeeded. Output may be incomplete."
        )

    chunk_results.sort(key=lambda r: r.page_offset)
    return chunk_results


async def _attempt_single_raster_fallback(
    chunk_index: int,
    pdf_chunks: list[bytes],
    page_offsets: list[int],
    total_chunks: int,
    stem: str,
    filename: str,
    project_id: UUID | None,
    max_resubmit_attempts: int = 3,
) -> DoclingChunkResult | None:
    """Rasterize and re-extract a single failed chunk. Returns None on failure."""
    chunk_num = chunk_index + 1
    try:
        raster_result = await rasterize_chunk(
            chunk_bytes=pdf_chunks[chunk_index], chunk_index=chunk_index, total_chunks=total_chunks
        )
        workflow.logger.info(
            f"Rasterized chunk {chunk_num}: {raster_result.original_size_mb:.2f}MB -> {raster_result.rasterized_size_mb:.2f}MB"
        )
        fallback_result = await extract_docling_chunk(
            chunk_bytes=raster_result.rasterized_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            page_offset=page_offsets[chunk_index],
            output_prefix=stem,
            filename=filename,
            project_id=project_id,
            max_resubmit_attempts=max_resubmit_attempts,
        )
        workflow.logger.info(f"Raster fallback succeeded for chunk {chunk_num}")
        return fallback_result
    except Exception as fallback_err:
        workflow.logger.warning(f"Raster fallback also failed for chunk {chunk_num}, skipping: {fallback_err}")
        return None


async def _raster_fallback_for_chunks(
    failed_indices: list[int],
    timeout_indices: set[int],
    pdf_chunks: list[bytes],
    page_offsets: list[int],
    total_chunks: int,
    stem: str,
    filename: str,
    project_id: UUID | None,
    cfg: "Config",
    chunk_results: list[DoclingChunkResult],
) -> None:
    """Apply raster fallback for failed chunks (sequentially)."""
    workflow.logger.info(
        f"Attempting raster fallback for {len(failed_indices)} failed chunk(s) "
        f"({len(timeout_indices)} timeout(s) will be skipped)"
    )
    for i in failed_indices:
        chunk_num = i + 1
        chunk_size_mb = len(pdf_chunks[i]) / (1024 * 1024)
        if chunk_size_mb > cfg.PDF_TARGET_CHUNK_MB:
            workflow.logger.info(
                f"Chunk {chunk_num} is {chunk_size_mb:.1f}MB (> {cfg.PDF_TARGET_CHUNK_MB}MB target), skipping raster"
            )
            continue
        if i in timeout_indices:
            workflow.logger.info(f"Chunk {chunk_num} failed due to timeout, skipping raster fallback")
            continue

        result = await _attempt_single_raster_fallback(
            i,
            pdf_chunks,
            page_offsets,
            total_chunks,
            stem,
            filename,
            project_id,
            max_resubmit_attempts=cfg.DOCLING_MAX_RESUBMIT_ATTEMPTS,
        )
        if result is not None:
            chunk_results.append(result)


async def _split_fallback_for_chunks(
    failed_indices: list[int],
    pdf_chunks: list[bytes],
    page_offsets: list[int],
    stem: str,
    filename: str,
    project_id: UUID | None,
    cfg: "Config",
    chunk_results: list[DoclingChunkResult],
) -> None:
    """Split failed chunks into sub-chunks and retry extraction.

    Last-resort fallback for chunks that failed all previous retry strategies.
    Splits each failed chunk into smaller pieces (via the split activity with
    force_split=True) and extracts each sub-chunk independently.
    """
    workflow.logger.info(f"Attempting split fallback for {len(failed_indices)} failed chunk(s)")
    for i in list(failed_indices):
        chunk_num = i + 1
        chunk_bytes = pdf_chunks[i]
        chunk_size_mb = len(chunk_bytes) / (1024 * 1024)

        try:
            split_result = await split_pdf_for_docling(
                chunk_bytes,
                chunk_size_mb,
                force_split=True,
            )
        except Exception as split_err:
            workflow.logger.warning(f"Failed to split chunk {chunk_num}: {split_err}")
            continue

        sub_chunks = split_result.chunks
        sub_offsets = split_result.page_offsets

        if len(sub_chunks) <= 1:
            workflow.logger.info(
                f"Chunk {chunk_num} produced only 1 sub-chunk after split, skipping (would just repeat)"
            )
            continue

        workflow.logger.info(f"Chunk {chunk_num} split into {len(sub_chunks)} sub-chunks, retrying each")

        base_page_offset = page_offsets[i]
        sub_ok = 0
        for j, (sub_bytes, sub_page_offset) in enumerate(zip(sub_chunks, sub_offsets, strict=False)):
            try:
                sub_result = await extract_docling_chunk(
                    chunk_bytes=sub_bytes,
                    chunk_index=j,
                    total_chunks=len(sub_chunks),
                    page_offset=base_page_offset + sub_page_offset,
                    output_prefix=stem,
                    filename=filename,
                    project_id=project_id,
                    max_resubmit_attempts=cfg.DOCLING_MAX_RESUBMIT_ATTEMPTS,
                )
                chunk_results.append(sub_result)
                sub_ok += 1
            except Exception as sub_err:
                workflow.logger.warning(f"Sub-chunk {j + 1}/{len(sub_chunks)} of chunk {chunk_num} failed: {sub_err}")

        if sub_ok > 0:
            failed_indices.remove(i)
            workflow.logger.info(
                f"Split fallback for chunk {chunk_num}: {sub_ok}/{len(sub_chunks)} sub-chunks succeeded"
            )
        else:
            workflow.logger.warning(f"Split fallback for chunk {chunk_num}: all sub-chunks failed")


async def process_pdf_with_docling(
    input: DoclingActivityInput,
) -> ExtractionOutput:
    """
    Process a PDF document with Docling extraction service.

    This function orchestrates the extraction pipeline:
    1. Download and prepare PDF from DMS (via activity)
    2. Compress embedded images to reduce memory pressure (via activity)
    3. Split large PDFs into chunks with adaptive sizing (via activity)
    4. Process each chunk with Docling API (via activity)
    5. Combine results (via activity)
    6. Deduplicate images (via activity)

    Args:
        input: DoclingActivityInput with file_info and project_id

    Returns:
        ExtractionOutput with markdown, content_list, and image_bytes

    Note:
        This function is called from the workflow thread but all heavy operations
        are delegated to activities to avoid blocking and enable per-step retry.
    """
    filename = input.file_info.filename
    stem = _sanitize_stem(Path(filename).stem)

    workflow.logger.info(f"Starting Docling extraction for: {filename}")

    # Step 1: Download and prepare PDF
    prepared = await download_and_prepare_pdf(input)
    pdf_bytes = prepared.pdf_bytes
    file_size_mb = prepared.file_size_mb

    workflow.logger.info(f"PDF prepared: {prepared.filename} ({file_size_mb:.2f} MB)")

    # Existing histories must retain the direct prepare → compression schedule.
    if workflow.patched("docling-plan-fast-path"):
        # Lagepläne / CAD sheets: rasterize first. Native Docling sees empty text
        # and no images on vector plots, or spends an hour on CAD paths.
        metrics = await collect_metrics(pdf_bytes)
        if metrics is not None and is_plan_document(metrics):
            workflow.logger.info(f"Plan sheet {filename}: rasterize then Docling")
            raster_result = await rasterize_chunk(chunk_bytes=pdf_bytes, chunk_index=0, total_chunks=1)
            pdf_bytes = raster_result.rasterized_bytes
            file_size_mb = raster_result.rasterized_size_mb

    # Step 2: Compress embedded images (reduces memory pressure on docling-serve)
    compression_result = await compress_pdf_images(pdf_bytes, file_size_mb)
    pdf_bytes = compression_result.pdf_bytes
    file_size_mb = compression_result.file_size_mb

    # Step 3: Split PDF into chunks (if large) with adaptive sizing
    split_result = await split_pdf_for_docling(pdf_bytes, file_size_mb)
    pdf_chunks = split_result.chunks
    page_offsets = split_result.page_offsets

    workflow.logger.info(f"Processing {len(pdf_chunks)} chunk(s)")

    # Step 4: Process chunks with Docling (parallel with semaphore + raster fallback)
    chunk_results = await _extract_all_chunks(
        pdf_chunks=pdf_chunks,
        page_offsets=page_offsets,
        stem=stem,
        filename=filename,
        project_id=input.project_id,
    )

    # Step 5: Combine all chunks in a single activity call.
    # With S3-based refs, each DoclingChunkResult is ~500 bytes (just refs),
    # so passing all chunks at once is well within Temporal's payload limits.
    # The combine activity processes chunks one at a time to bound memory,
    # streams combined data to temp files, and uploads the result to S3.
    combined = await combine_docling_chunks(
        chunk_results,
        project_id=input.project_id,
        filename=filename,
    )
    md_content = combined.md_content
    content_list = combined.content_list
    image_refs = combined.image_refs
    fallback_images = combined.images

    workflow.logger.info(
        f"Combined: {len(content_list)} content items, "
        f"{len(image_refs)} image refs, {len(fallback_images)} fallback images"
    )

    # Step 6: Deduplicate images — SKIPPED when images were uploaded per-chunk.
    # The downstream filter_enhance step already handles deduplication via
    # perceptual hashing as part of its recurring-element detection pass.
    # Only run dedup when we have fallback image bytes (upload-failed path).
    if fallback_images and not image_refs:
        dedup_result = await deduplicate_images(content_list, fallback_images)
        fallback_images = dedup_result.images
        if dedup_result.duplicate_paths:
            workflow.logger.info(f"Removed {len(dedup_result.duplicate_paths)} duplicate images")
    else:
        workflow.logger.info("Skipping image deduplication (images uploaded per-chunk to DMS)")

    workflow.logger.info(f"Docling extraction completed for: {filename}")

    return ExtractionOutput(
        markdown=md_content,
        content_list=content_list,
        image_bytes=fallback_images,
        image_refs=image_refs,
    )
