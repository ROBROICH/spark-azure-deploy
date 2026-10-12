"""Docling chunk extraction, combination, and deduplication activities."""

import asyncio
import logging
import mimetypes
import re
from datetime import timedelta
from typing import Any
from uuid import UUID

import pypdfium2 as pdfium
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config, get_docling_activity_timeout_minutes, get_docling_url
from src.processors.header_footer_filter import HeaderFooterFilter
from src.providers.base import ContentItemDict
from src.providers.docling.api_client import DoclingApiClient, DoclingTaskLostError
from src.providers.docling.content_builder import ContentBuilder
from src.providers.docling.image_extractor import ImageExtractor
from src.providers.docling.markdown_builder import MarkdownBuilder
from src.providers.docling.page_renderer import PageRenderer
from src.providers.docling.table_extractor import TableExtractor
from src.providers.docling.transforms import sanitize_output_prefix
from src.services.docling.schemas import (
    CombineDoclingChunksInput,
    CombineDoclingChunksOutput,
    DeduplicateImagesInput,
    DeduplicateImagesOutput,
    DoclingChunkResult,
    ExtractChunkInput,
    SubmitChunkInput,
    SubmitChunkOutput,
    WaitForChunkInput,
    WaitForChunkOutput,
)
from src.utils.dms_utils import DmsUploadInput
from src.utils.dms_utils import upload_file_overwrite as dms_upload_file
from src.utils.path_utils import get_output_dir
from src.utils.pdfium_lock import _pdfium_lock

__all__ = [
    "_combine_docling_chunks",
    "_deduplicate_images",
    "_extract_chunk_with_docling",
    "_submit_chunk_to_docling",
    "_wait_for_docling_result",
    "combine_docling_chunks",
    "deduplicate_images",
    "extract_chunk_with_docling",
    "submit_chunk_to_docling",
    "wait_for_docling_result",
]

logger = logging.getLogger(__name__)

# Heartbeat cadence while the crops run; the activity allows two minutes.
_CROP_HEARTBEAT_SECONDS = 20


async def _upload_chunk_images(
    images_bytes: dict[str, bytes],
    total_chunks: int,
    project_id: UUID | None,
    cfg: "Any",
    upload_folder: str,
    chunk_num: int,
) -> tuple[dict[str, str], dict[str, bytes]]:
    """Upload images to DMS for split documents, returning refs and fallback bytes."""
    is_split_doc = total_chunks > 1 and project_id is not None
    if not (is_split_doc and images_bytes and project_id is not None):
        return {}, images_bytes

    image_refs: dict[str, str] = {}
    fallback_images: dict[str, bytes] = {}

    activity.logger.info(f"Chunk {chunk_num}: uploading {len(images_bytes)} images to DMS (split-doc path)")
    upload_semaphore = asyncio.Semaphore(cfg.MAX_CONCURRENT_DMS_IMAGE_UPLOADS)

    async def _upload_one(img_name: str, img_data: bytes) -> None:
        """Upload a single chunk image to DMS with semaphore gating."""
        async with upload_semaphore:
            img_content_type, _ = mimetypes.guess_type(img_name)
            if not img_content_type:
                img_content_type = "image/png"
            try:
                file_obj = await dms_upload_file(
                    DmsUploadInput(
                        data=img_data,
                        filename=f"{upload_folder}/images/{img_name}",
                        project_id=project_id,
                        file_type="content_extraction",
                        content_type=img_content_type,
                    )
                )
                image_refs[img_name] = str(file_obj.id)
            except Exception as e:
                activity.logger.warning(f"Failed to upload image {img_name} for chunk {chunk_num}: {e}")
                fallback_images[img_name] = img_data

    await asyncio.gather(*[_upload_one(name, data) for name, data in images_bytes.items()])
    activity.logger.info(
        f"Chunk {chunk_num}: uploaded {len(image_refs)}/{len(images_bytes)} images to DMS"
        + (f" ({len(fallback_images)} kept as fallback)" if fallback_images else "")
    )
    return image_refs, fallback_images


async def _extract_images_and_tables(
    doc_json: dict[str, Any],
    original_md: str,
    output_prefix: str,
    chunk_bytes: bytes,
    cfg: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, bytes], set[str]]:
    """Extract images and tables from docling JSON, cropping from the PDF what docling did not embed."""
    images_meta, images_bytes = await asyncio.to_thread(ImageExtractor.extract_from_json, doc_json, output_prefix)

    if not images_bytes and original_md:
        activity.logger.info("No images in JSON, extracting from markdown content")
        images_meta, images_bytes = await asyncio.to_thread(
            ImageExtractor.extract_from_markdown, original_md, doc_json, output_prefix
        )

    # Decided before the table extraction, which writes its own images into
    # images_bytes -- otherwise a document with embedded table images but no
    # picture images would leave its pictures without pixels.
    crop_pictures = not images_bytes and bool(doc_json.get("pictures"))

    tables_meta = await asyncio.to_thread(TableExtractor.extract_from_json, doc_json, output_prefix, images_bytes)

    # One pass over the PDF for everything that still needs pixels. Pictures and
    # tables often sit on the same page, so they share one set of page renders.
    skipped_picture_refs: set[str] = set()
    if crop_pictures or cfg.DOCLING_TABLE_AS_IMAGE:
        picture_meta, picture_bytes, skipped_picture_refs = await _crop_with_heartbeat(
            chunk_bytes,
            doc_json,
            tables_meta,
            images_bytes,
            output_prefix,
            crop_pictures=crop_pictures,
            crop_tables=cfg.DOCLING_TABLE_AS_IMAGE,
        )
        if picture_meta:
            images_meta = list(images_meta) + picture_meta
            images_bytes.update(picture_bytes)

    return images_meta, tables_meta, images_bytes, skipped_picture_refs


async def _crop_with_heartbeat(
    chunk_bytes: bytes,
    doc_json: dict[str, Any],
    tables_meta: list[dict[str, Any]],
    images_bytes: dict[str, bytes],
    output_prefix: str,
    crop_pictures: bool,
    crop_tables: bool,
) -> tuple[list[dict[str, Any]], dict[str, bytes], set[str]]:
    """Run the crops in a worker thread, reporting liveness from this loop.

    activity.heartbeat needs the activity's event loop, so it cannot be called
    from the thread itself: it raises "no running event loop", and with the
    crop guarded by a broad except the chunk silently loses every image.
    """
    task = asyncio.create_task(
        asyncio.to_thread(
            _crop_from_pdf,
            chunk_bytes,
            doc_json,
            tables_meta,
            images_bytes,
            output_prefix,
            crop_pictures=crop_pictures,
            crop_tables=crop_tables,
        )
    )
    while not task.done():
        activity.heartbeat("Cropping images from PDF")
        await asyncio.wait([task], timeout=_CROP_HEARTBEAT_SECONDS)
    return await task


def _crop_from_pdf(
    chunk_bytes: bytes,
    doc_json: dict[str, Any],
    tables_meta: list[dict[str, Any]],
    images_bytes: dict[str, bytes],
    output_prefix: str,
    crop_pictures: bool,
    crop_tables: bool,
) -> tuple[list[dict[str, Any]], dict[str, bytes], set[str]]:
    """Crop pictures and tables from one PDF, sharing a single set of page renders.

    CPU-bound; call through _crop_with_heartbeat, which keeps the activity
    alive while this holds the process-global pdfium lock. ``tables_meta`` and
    ``images_bytes`` are modified in place for tables, matching the existing
    table behaviour.
    """
    picture_meta: list[dict[str, Any]] = []
    picture_bytes: dict[str, bytes] = {}
    skipped: set[str] = set()
    try:
        with _pdfium_lock:
            pdf_doc = pdfium.PdfDocument(chunk_bytes)
            renderer = PageRenderer.for_document(pdf_doc)
            try:
                if crop_pictures:
                    picture_meta, picture_bytes, skipped = ImageExtractor.crop_pictures(
                        renderer, doc_json, output_prefix
                    )
                if crop_tables:
                    TableExtractor.crop_tables(renderer, tables_meta, images_bytes, output_prefix)
            finally:
                renderer.close()
                pdf_doc.close()
    except Exception as e:  # extraction continues without the crops
        logger.error(f"Failed to crop images from PDF: {e}")
    return picture_meta, picture_bytes, skipped


def replace_images_with_page_markers(content: str, base_page_number: int | None = None) -> str:
    """Replaces markdown images and page markers with updated formatting.
    Searches for markdown images (`![alt](url)`) and replaces them with
    `**[Image Seite=X]**`, referencing the nearest preceding page tag.
    If no page tag exists in the chunk, falls back to `base_page_number`.
    """
    # Pattern to match markdown images: ![alt](url)
    image_pattern = re.compile(r"!\[.*?\]\([^)]*\)")

    # Pattern to match the XML page marker and capture the number
    page_pattern = re.compile(r'<seite\s+nummer="(\d+)"\s*/>')

    def _replace_match(match: re.Match[str]) -> str:
        text_before_image = content[: match.start()]
        page_matches = list(page_pattern.finditer(text_before_image))

        page_number = page_matches[-1].group(1) if page_matches else base_page_number or "Unknown"

        return f"**[Image Seite={page_number}]**"

    content_with_images_replaced = image_pattern.sub(_replace_match, content)

    return page_pattern.sub(r"**[Seite \1]**", content_with_images_replaced)


async def _postprocess_docling_result(
    api_result: dict[str, Any],
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
    page_offset: int,
    output_prefix: str,
    filename: str,
    project_id: UUID | None,
    skip_dms: bool = False,
) -> DoclingChunkResult:
    """Post-process a docling-serve result: extract images/tables, build markdown, upload to DMS.

    Shared by the monolithic activity and the split wait activity.
    Must be called from within an activity context (uses activity.heartbeat/logger).
    """
    chunk_num = chunk_index + 1
    cfg = get_config()

    # Sanitize output prefix
    output_prefix = sanitize_output_prefix(output_prefix)
    if total_chunks > 1:
        output_prefix = f"{output_prefix}_chunk{chunk_num}"

    doc_data = api_result.get("document", {})
    doc_json = doc_data.get("json_content", {})
    original_md = doc_data.get("md_content", "")

    if not doc_json:
        raise RuntimeError("docling-serve returned empty json_content")

    activity.logger.info(
        f"docling-serve returned {len(doc_json.get('texts', []))} texts, "
        f"{len(doc_json.get('tables', []))} tables, "
        f"{len(doc_json.get('pictures', []))} pictures"
    )

    activity.heartbeat("Extracting images and tables")
    images_meta, tables_meta, images_bytes, skipped_picture_refs = await _extract_images_and_tables(
        doc_json,
        original_md,
        output_prefix,
        chunk_bytes,
        cfg,
    )

    # Build custom markdown
    activity.heartbeat("Building markdown")
    custom_md = await asyncio.to_thread(
        MarkdownBuilder.build,
        doc_json=doc_json,
        images_meta=images_meta,
        tables_meta=tables_meta,
        skip_picture_refs=skipped_picture_refs,
    )

    # Build content list from JSON
    activity.heartbeat("Building content list")
    content_list = await asyncio.to_thread(
        ContentBuilder.build_from_json,
        doc_json=doc_json,
        images_meta=images_meta,
        tables_meta=tables_meta,
    )

    # Detect and inject full-page images for pages where docling missed dominant images
    if cfg.DETECT_FULL_PAGE_IMAGES:
        activity.heartbeat("Detecting full-page images")
        images_meta, images_bytes, content_list, custom_md = await asyncio.to_thread(
            ImageExtractor.inject_full_page_images,
            doc_json=doc_json,
            images_meta=images_meta,
            images_bytes=images_bytes,
            content_list=content_list,
            markdown=custom_md,
            output_prefix=output_prefix,
            pdf_bytes=chunk_bytes,
        )

    activity.logger.info(
        f"Chunk {chunk_num} extraction complete: {len(content_list)} content items, {len(images_bytes)} images"
    )

    upload_folder = get_output_dir(filename)

    image_refs: dict[str, str] = {}
    fallback_images: dict[str, bytes] = {}
    if not skip_dms:
        image_refs, fallback_images = await _upload_chunk_images(
            images_bytes,
            total_chunks,
            project_id,
            cfg,
            upload_folder,
            chunk_num,
        )

    return DoclingChunkResult(
        md_content=custom_md,
        content_list=content_list,
        images=fallback_images,
        image_refs=image_refs,
        original_md_content=original_md,
        page_offset=page_offset,
    )


@activity.defn(name="extract_chunk_with_docling")
async def _extract_chunk_with_docling(input: ExtractChunkInput) -> DoclingChunkResult:
    """Extract content from a single PDF chunk using docling-serve API (monolithic).

    .. deprecated::
        Superseded by submit_chunk_to_docling + wait_for_docling_result.
        Kept registered in ACTIVITIES for replay of pre-split workflows.
        Remove once all in-flight workflows using this activity have completed.
    """
    chunk_num = input.chunk_index + 1
    activity.logger.info(f"Processing chunk {chunk_num}/{input.total_chunks} (page offset: {input.page_offset})")

    docling_url = get_docling_url()
    if not docling_url:
        raise RuntimeError(
            "DOCLING_URL not configured. Set DOCLING_HOST environment variable to point to docling-serve API."
        )

    cfg = get_config()
    api_client = DoclingApiClient(docling_url, cfg.DOCLING_TIMEOUT, cfg.DOCLING_QUEUE_WAIT_TIMEOUT)
    result = await api_client.convert_document(
        input.chunk_bytes,
        input.filename,
        heartbeat_fn=activity.heartbeat,
        log_fn=activity.logger.info,
    )

    return await _postprocess_docling_result(
        api_result=result,
        chunk_bytes=input.chunk_bytes,
        chunk_index=input.chunk_index,
        total_chunks=input.total_chunks,
        page_offset=input.page_offset,
        output_prefix=input.output_prefix,
        filename=input.filename,
        project_id=input.project_id,
    )


@activity.defn(name="submit_chunk_to_docling")
async def _submit_chunk_to_docling(input: SubmitChunkInput) -> SubmitChunkOutput:
    """Submit a PDF chunk to docling-serve for async conversion.

    Fast activity (~seconds). Returns task_id. Raises on any failure
    so Temporal's retry policy can re-attempt.
    """
    chunk_num = input.chunk_index + 1
    activity.logger.info(f"Submitting chunk {chunk_num}/{input.total_chunks} to docling")

    docling_url = get_docling_url()
    if not docling_url:
        raise RuntimeError(
            "DOCLING_URL not configured. Set DOCLING_HOST environment variable to point to docling-serve API."
        )

    cfg = get_config()
    api_client = DoclingApiClient(docling_url, cfg.DOCLING_TIMEOUT, cfg.DOCLING_QUEUE_WAIT_TIMEOUT)

    task_id = await api_client.submit_document(
        input.chunk_bytes,
        input.filename,
        heartbeat_fn=activity.heartbeat,
    )

    activity.logger.info(f"Chunk {chunk_num}: submitted as task {task_id}")
    return SubmitChunkOutput(task_id=task_id)


@activity.defn(name="wait_for_docling_result")
async def _wait_for_docling_result(input: WaitForChunkInput) -> WaitForChunkOutput:
    """Poll docling-serve for a previously submitted task, fetch result, and post-process.

    Returns task_not_found=True if docling lost the task (pod restart, 404).
    """
    chunk_num = input.chunk_index + 1
    activity.logger.info(f"Waiting for docling task {input.task_id} (chunk {chunk_num}/{input.total_chunks})")

    docling_url = get_docling_url()
    if not docling_url:
        raise RuntimeError(
            "DOCLING_URL not configured. Set DOCLING_HOST environment variable to point to docling-serve API."
        )

    cfg = get_config()
    api_client = DoclingApiClient(docling_url, cfg.DOCLING_TIMEOUT, cfg.DOCLING_QUEUE_WAIT_TIMEOUT)
    try:
        api_result = await api_client.poll_and_fetch_result(
            input.task_id,
            heartbeat_fn=activity.heartbeat,
        )
    except DoclingTaskLostError:
        activity.logger.warning(f"Task {input.task_id} lost (chunk {chunk_num}) — will re-submit")
        return WaitForChunkOutput(task_not_found=True, result=None)

    chunk_result = await _postprocess_docling_result(
        api_result=api_result,
        chunk_bytes=input.chunk_bytes,
        chunk_index=input.chunk_index,
        total_chunks=input.total_chunks,
        page_offset=input.page_offset,
        output_prefix=input.output_prefix,
        filename=input.filename,
        project_id=input.project_id,
        skip_dms=input.skip_dms,
    )

    return WaitForChunkOutput(task_not_found=False, result=chunk_result)


@activity.defn(name="combine_docling_chunks")
async def _combine_docling_chunks(
    input: CombineDoclingChunksInput,
) -> CombineDoclingChunksOutput:
    """
    Combine Docling chunk results into a single result.

    **Single chunk**: passes through directly (no-op).

    **Multiple chunks**: concatenates markdown strings and extends content
    lists in memory. Temporal's S3 payload codec transparently offloads
    the combined result if it exceeds 2MB.
    """
    total = len(input.chunk_results)
    activity.logger.info(f"Combining {total} chunk results")

    def _combine_sync(
        chunk_results: list[DoclingChunkResult],
    ) -> tuple[str, list[ContentItemDict], dict[str, bytes], dict[str, str]]:
        """Combine chunk results synchronously (CPU-bound: regex, list ops)."""

        def _offset_page_tags(md: str, offset: int) -> str:
            if offset == 0:
                return md

            def _replace(m: re.Match[str]) -> str:
                old_num = int(m.group(1))
                return f'<seite nummer="{old_num + offset}" />'

            return re.sub(r'<seite nummer="(\d+)" />', _replace, md)

        md_parts: list[str] = []
        combined_cl: list[ContentItemDict] = []
        all_image_refs: dict[str, str] = {}
        all_images: dict[str, bytes] = {}

        for chunk in chunk_results:
            page_offset = chunk.page_offset
            md_parts.append(_offset_page_tags(chunk.md_content, page_offset))
            for item in chunk.content_list:
                if "page_idx" in item:
                    item["page_idx"] = item["page_idx"] + page_offset
                combined_cl.append(item)
            all_images.update(chunk.images)
            all_image_refs.update(chunk.image_refs)

        return "".join(md_parts), combined_cl, all_images, all_image_refs

    combined_md, combined_cl, all_images, all_image_refs = await asyncio.to_thread(_combine_sync, input.chunk_results)

    activity.logger.info(
        f"Combined {total} chunks: {len(combined_cl)} content items, "
        f"{len(all_image_refs)} image refs, {len(all_images)} fallback images"
    )

    return CombineDoclingChunksOutput(
        md_content=combined_md,
        content_list=combined_cl,
        images=all_images,
        image_refs=all_image_refs,
        original_md_content=None,
    )


@activity.defn(name="deduplicate_images_docling")
async def _deduplicate_images(input: DeduplicateImagesInput) -> DeduplicateImagesOutput:
    """
    Deduplicate images using perceptual hashing.

    This is a CPU-intensive operation that uses imagehash to find similar images
    across the document (e.g., recurring logos, headers).

    Args:
        input: DeduplicateImagesInput with content_list and images

    Returns:
        DeduplicateImagesOutput with filtered images and list of duplicates
    """
    activity.logger.info(f"Deduplicating {len(input.images)} images")
    activity.heartbeat("Starting perceptual hashing")

    # Use the existing HeaderFooterFilter.find_duplicate_images
    # This handles perceptual hashing and grouping (CPU-intensive)
    duplicate_img_paths = await asyncio.to_thread(
        HeaderFooterFilter.find_duplicate_images, input.content_list, input.images
    )
    activity.heartbeat(f"Hashing complete, {len(duplicate_img_paths)} duplicates found")

    if not duplicate_img_paths:
        activity.logger.info("No duplicate images found")
        return DeduplicateImagesOutput(
            images=input.images,
            duplicate_paths=[],
        )

    # Filter out duplicates
    filtered_images = {
        k: v
        for k, v in input.images.items()
        if k not in duplicate_img_paths and f"images/{k}" not in duplicate_img_paths
    }

    activity.logger.info(
        f"Image dedup: {len(input.images)} -> {len(filtered_images)} images "
        f"({len(duplicate_img_paths)} duplicates removed)"
    )

    return DeduplicateImagesOutput(
        images=filtered_images,
        duplicate_paths=list(duplicate_img_paths),
    )


async def extract_chunk_with_docling(
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
    page_offset: int,
    output_prefix: str,
    filename: str,
    project_id: UUID | None = None,
) -> DoclingChunkResult:
    """Workflow wrapper for extract_chunk_with_docling activity."""
    return await workflow.execute_activity(
        _extract_chunk_with_docling,
        ExtractChunkInput(
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            page_offset=page_offset,
            output_prefix=output_prefix,
            filename=filename,
            project_id=project_id,
        ),
        start_to_close_timeout=timedelta(minutes=get_docling_activity_timeout_minutes()),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_EXTRACTION_ACTIVITY_MAX_ATTEMPTS,
            initial_interval=timedelta(seconds=60),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(seconds=300),
        ),
    )


async def submit_chunk_to_docling(
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
    filename: str,
) -> SubmitChunkOutput:
    """Workflow wrapper for submit_chunk_to_docling activity."""
    return await workflow.execute_activity(
        _submit_chunk_to_docling,
        SubmitChunkInput(
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            filename=filename,
        ),
        start_to_close_timeout=timedelta(minutes=5),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_EXTRACTION_ACTIVITY_MAX_ATTEMPTS,
            initial_interval=timedelta(seconds=30),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(seconds=120),
        ),
    )


async def wait_for_docling_result(
    task_id: str,
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
    page_offset: int,
    output_prefix: str,
    filename: str,
    project_id: UUID | None = None,
    skip_dms: bool = False,
) -> WaitForChunkOutput:
    """Workflow wrapper for wait_for_docling_result activity."""
    return await workflow.execute_activity(
        _wait_for_docling_result,
        WaitForChunkInput(
            task_id=task_id,
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            page_offset=page_offset,
            output_prefix=output_prefix,
            filename=filename,
            project_id=project_id,
            skip_dms=skip_dms,
        ),
        start_to_close_timeout=timedelta(minutes=get_docling_activity_timeout_minutes()),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_EXTRACTION_ACTIVITY_MAX_ATTEMPTS,
            initial_interval=timedelta(seconds=60),
            backoff_coefficient=2.0,
            maximum_interval=timedelta(seconds=300),
        ),
    )


async def combine_docling_chunks(
    chunk_results: list[DoclingChunkResult],
    project_id: UUID | None = None,
    filename: str | None = None,
) -> CombineDoclingChunksOutput:
    """Workflow wrapper for combine_docling_chunks activity."""
    return await workflow.execute_activity(
        _combine_docling_chunks,
        CombineDoclingChunksInput(
            chunk_results=chunk_results,
            project_id=project_id,
            filename=filename,
        ),
        start_to_close_timeout=timedelta(minutes=15),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )


async def deduplicate_images(
    content_list: list[ContentItemDict],
    images: dict[str, bytes],
) -> DeduplicateImagesOutput:
    """Workflow wrapper for deduplicate_images activity."""
    return await workflow.execute_activity(
        _deduplicate_images,
        DeduplicateImagesInput(content_list=content_list, images=images),
        start_to_close_timeout=timedelta(minutes=10),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
