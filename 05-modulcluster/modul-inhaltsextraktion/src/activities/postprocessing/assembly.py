"""Chunking and final JSON assembly activities."""

import asyncio
import re
from datetime import timedelta
from pathlib import Path

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.postprocessing.schemas import (
    AssembleFinalJsonResult,
    ChunkMarkdownInput,
    ChunkMarkdownOnlyParentChunksInput,
    CreateFinalJsonInput,
    SplitMarkdownByPagesInput,
)
from src.config import get_config
from src.processors.chunker import MarkdownChunker
from src.providers.base import ContentItemDict
from src.schemas import Chunk, ChunkEWMS, Metadata, ProcessedDocument
from src.utils.dms_utils import DmsUploadInput, upload_file
from src.utils.path_utils import get_output_dir
from src.utils.text_utils import split_markdown_by_pages as _split_markdown_impl

__all__ = [
    "_chunk_markdown",
    "_create_final_json",
    "_split_markdown_by_pages",
    "chunk_markdown",
    "create_final_json",
    "split_markdown_by_pages",
]


@activity.defn(name="chunk_markdown")
async def _chunk_markdown(input: ChunkMarkdownInput) -> list[Chunk]:
    """Chunks markdown content into hierarchical chunks."""
    activity.heartbeat("Starting chunking")
    result = await asyncio.to_thread(MarkdownChunker.chunk_markdown, input.markdown, input.content_list)
    activity.heartbeat(f"Chunking complete: {len(result)} chunks")
    return result


@activity.defn(name="_chunk_markdown_ewms")
async def _chunk_markdown_ewms(input: ChunkMarkdownOnlyParentChunksInput) -> list[ChunkEWMS]:
    """Chunks markdown content into EWMS-specific segments.

    Executes the synchronous EWMS markdown chunking process in a separate thread
    to prevent blocking the async event loop.
    """
    # Step 1: Record initial heartbeat
    activity.heartbeat("Starting chunking")

    # Step 2: Offload synchronous chunking logic to a background thread
    result = await asyncio.to_thread(MarkdownChunker.chunk_markdown_ewms, input.markdown)

    # Step 3: Record completion heartbeat and return the generated chunks
    activity.heartbeat(f"Chunking complete: {len(result)} chunks")

    return result


@activity.defn(name="split_markdown_by_pages")
async def _split_markdown_by_pages(input: SplitMarkdownByPagesInput) -> list[str]:
    """Splits markdown content by page markers into chunks."""
    return _split_markdown_impl(input.markdown, input.pages_per_chunk)


@activity.defn(name="create_final_json")
async def _create_final_json(input: CreateFinalJsonInput) -> AssembleFinalJsonResult:
    """
    Assembles the final processed document JSON and uploads it to DMS.

    This is an activity because model_dump_json() on large documents is CPU-intensive
    and would block the workflow thread, causing deadlocks.
    """
    final_markdown = input.final_markdown
    chunks = input.chunks
    summary_result = input.summary_result
    base_metadata = input.base_metadata
    original_filename = input.original_filename
    processing_duration = input.processing_duration_seconds
    project_id = input.project_id

    # Find all page markers and get the maximum page number
    page_numbers = [int(m) for m in re.findall(r'<seite nummer="(\d+)"\s*/>', final_markdown)]
    page_count = max(page_numbers) if page_numbers else None

    metadata_payload = {
        "original_document_name": original_filename,
        "source_file_id": input.source_file_id,
        "project_id": str(project_id),
        "pages": page_count,
        "base_metadata": base_metadata.model_dump() if base_metadata else None,
        "summary": summary_result.summary if summary_result else None,
        "processing_duration_seconds": processing_duration,
        "document_topic": input.document_theme.model_dump() if input.document_theme else None,
    }

    metadata = Metadata(**metadata_payload)
    processed_document = ProcessedDocument(metadata=metadata, markdown_content=final_markdown, chunks=chunks)

    activity.heartbeat("Serializing final JSON")
    json_bytes = await asyncio.to_thread(
        lambda: processed_document.model_dump_json(indent=4, by_alias=True).encode("utf-8")
    )
    activity.heartbeat(f"Serialized {len(json_bytes) / (1024 * 1024):.1f} MB, uploading")

    # Get output directory (mirrors input folder structure) and stem for filename
    doc_stem = get_output_dir(original_filename)
    stem = Path(original_filename).stem
    output_filename = f"{doc_stem}/{stem}_processed.json"

    file_obj = await upload_file(
        DmsUploadInput(
            data=json_bytes,
            filename=output_filename,
            project_id=project_id,
            file_type="content_extraction",
            content_type="application/json",
        )
    )

    return AssembleFinalJsonResult(
        final_json_file_id=file_obj.id,
        filename=output_filename,
        processed_document=processed_document,
    )


# --- Workflow wrappers ---


async def chunk_markdown(
    markdown: str,
    content_list: list[ContentItemDict],
) -> list[Chunk]:
    """Workflow wrapper for chunk_markdown activity."""
    return await workflow.execute_activity(
        _chunk_markdown,
        ChunkMarkdownInput(markdown=markdown, content_list=content_list),
        start_to_close_timeout=timedelta(minutes=15),
        heartbeat_timeout=timedelta(minutes=3),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )


async def chunk_markdown_ewms(
    markdown: str,
) -> list["ChunkEWMS"]:
    """Workflow wrapper for executing the EWMS markdown chunking activity."""
    return await workflow.execute_activity(
        _chunk_markdown_ewms,
        ChunkMarkdownOnlyParentChunksInput(markdown=markdown),
        start_to_close_timeout=timedelta(minutes=10),
        heartbeat_timeout=timedelta(minutes=3),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )


async def split_markdown_by_pages(
    markdown: str,
    pages_per_chunk: int = 1,
) -> list[str]:
    """Workflow wrapper for split_markdown_by_pages activity."""
    return await workflow.execute_activity(
        _split_markdown_by_pages,
        SplitMarkdownByPagesInput(markdown=markdown, pages_per_chunk=pages_per_chunk),
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )


async def create_final_json(input: CreateFinalJsonInput) -> AssembleFinalJsonResult:
    """Workflow wrapper for create_final_json activity."""
    return await workflow.execute_activity(
        _create_final_json,
        input,
        start_to_close_timeout=timedelta(minutes=5),
        heartbeat_timeout=timedelta(minutes=3),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_STORAGE_ACTIVITY_MAX_ATTEMPTS),
    )
