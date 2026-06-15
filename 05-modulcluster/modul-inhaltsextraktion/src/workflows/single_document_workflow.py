# src/workflows/single_document_workflow.py
"""
Temporal workflow for processing a single document.

This workflow processes a single document from DMS:
1. Downloads the document using file_id
2. Converts to PDF if needed
3. Extracts content with Docling
4. Enhances with VLM
5. Extracts metadata
6. Uploads results to DMS
"""

import asyncio
import re
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel
from temporal.workflows.inhaltsextraktion.types import TASK_QUEUE, BaseMetadata, DocumentTopic
from temporalio import workflow
from temporalio.client import Client, WorkflowHandle
from temporalio.common import WorkflowIDReusePolicy

from src.activities.deletion import CleanupContentExtractionsInput, cleanup_content_extractions_dms
from src.activities.dms_activities import DmsFileInfo
from src.activities.postprocessing.assembly import chunk_markdown, create_final_json
from src.activities.postprocessing.filtering import filter_enhance, prepare_vlm_inputs_wrapper
from src.activities.postprocessing.images import upload_images_to_dms
from src.activities.postprocessing.schemas import CreateFinalJsonInput, FilterEnhanceResult
from src.activities.vlm_processing import apply_vlm_results
from src.config import snapshot_config
from src.schemas import Chunk, ExtractionOutput
from src.services.docling_processing import DoclingActivityInput
from src.workflows.chunk_enrichment.workflow import (
    ChunkEnrichmentWorkflow,
    ChunkEnrichmentWorkflowInput,
)
from src.workflows.extraction.docling_workflow import DoclingExtractionWorkflow
from src.workflows.helpers.base_metadata_extractor import extract_base_metadata
from src.workflows.pageindex_structure.workflow import (
    MyPageIndexWorkflowInput,
    MyPageIndexWorkflowOutput,
    PageStructureWorkflow,
)
from src.workflows.summarization.document_workflow import (
    DocumentSummarizationWorkflow,
    DocumentSummarizationWorkflowInput,
)
from src.workflows.summarization.output_format import SummaryOutput
from src.workflows.theme_classification.workflow import (
    ThemeClassificationWorkflow,
    ThemeClassificationWorkflowInput,
    ThemeClassificationWorkflowOutput,
)
from src.workflows.types import SingleDocumentWorkflowOutput
from src.workflows.vlm_enhancement.batch_workflow import VLMProcessingWorkflow
from src.workflows.vlm_enhancement.output_format import VLMProcessingWorkflowInput

single_document_workflow_id = "single-document-workflow"
_BAD_UTF8_CHARS = re.compile(r"[\u0000\ud800-\udfff]")


def _sanitize(obj: Any) -> Any:
    if isinstance(obj, str):
        return _BAD_UTF8_CHARS.sub("", obj)
    if isinstance(obj, BaseModel):
        return _sanitize(obj.model_dump())
    if isinstance(obj, dict):
        return {_sanitize(k): _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_sanitize(x) for x in obj]
    return obj


class SingleDocumentWorkflowInput(BaseModel):
    """
    Input for processing a single document from DMS.
    """

    project_id: UUID  # Project identifier
    file_info: DmsFileInfo  # File metadata (filename, mime_type, etc.)
    process_images: bool = True
    base_metadata: BaseMetadata | None = None
    is_priority_doc: bool = False
    possible_topics: list[DocumentTopic] | None


async def start_single_document(client: Client, input: SingleDocumentWorkflowInput) -> WorkflowHandle[Any, Any]:
    """Start a SingleDocumentWorkflow as a child workflow."""
    return await client.start_workflow(
        single_document_workflow_id,
        input,
        id=str(uuid4()),
        task_queue=TASK_QUEUE,
    )


async def execute_single_document(client: Client, input: SingleDocumentWorkflowInput) -> SingleDocumentWorkflowOutput:
    """Execute a SingleDocumentWorkflow and await its result."""
    return await client.execute_workflow(
        single_document_workflow_id,
        input,
        id=str(uuid4()),
        task_queue=TASK_QUEUE,
    )


@workflow.defn(name=single_document_workflow_id)
class SingleDocumentWorkflow:
    """Per-document processing pipeline workflow."""

    @workflow.run
    async def run(self, input: SingleDocumentWorkflowInput) -> SingleDocumentWorkflowOutput:
        """Orchestrates the document processing pipeline using DMS file_ids."""

        cfg = snapshot_config()
        processing_start_time = workflow.now().timestamp()

        document_stem = Path(input.file_info.filename).stem
        original_filename = input.file_info.filename

        workflow.logger.info(f"Starting document processing: {document_stem}")

        # Step 0: Clean-up if document already existed and is replaced
        cleanup_result = await cleanup_content_extractions_dms(
            CleanupContentExtractionsInput(
                project_id=input.project_id,
                filename=original_filename,
            )
        )

        if cleanup_result.content_extractions_deleted:
            workflow.logger.info(
                "Pre-cleanup deleted %d stale content extraction files for %s",
                len(cleanup_result.content_extractions_deleted),
                original_filename,
            )

        if cleanup_result.content_extractions_failed:
            workflow.logger.warning(
                "Pre-cleanup failed to delete some stale content extraction files for %s: %s",
                original_filename,
                cleanup_result.content_extractions_failed,
            )

        if cleanup_result.summary_update_failed:
            workflow.logger.warning(
                "Pre-cleanup could not fully remove %s from summary.json: %s",
                original_filename,
                cleanup_result.summary_update_failed,
            )

        # Step 1+2: Extract content using Docling provider
        workflow.logger.info(f"Using Docling provider for: {document_stem}")
        extraction_result: ExtractionOutput = await workflow.execute_child_workflow(
            DoclingExtractionWorkflow.run,
            DoclingActivityInput(
                file_info=input.file_info,
                project_id=input.project_id,
            ),
            id=f"docling-extraction-{workflow.info().workflow_id}",
            id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
            task_queue=workflow.info().task_queue,
            task_timeout=timedelta(seconds=60),
        )
        workflow.logger.info(f"Extraction completed: {document_stem}")

        # Step 3: Filter and enhance
        filtered_results: FilterEnhanceResult = await filter_enhance(
            extraction_result,
            project_id=input.project_id,
            filename=original_filename,
        )
        workflow.logger.info(f"Filtering completed: {document_stem}")

        # Step 4: Prepare VLM inputs (activity wrapper to avoid Temporal deadlock)
        vlm_inputs = await prepare_vlm_inputs_wrapper(filtered_results)

        # Get total count of VLM inputs
        total_vlm_inputs = len(vlm_inputs)

        workflow.logger.info(
            f"Starting parallel processing: Summarization + VLM ({total_vlm_inputs} tasks) + Enrichment + image upload for {document_stem}"
        )

        # Step 5a: Chunk pre-VLM markdown for enrichment (activity to avoid Temporal deadlock)
        pre_vlm_chunks = await chunk_markdown(filtered_results.markdown, filtered_results.content_list)
        workflow.logger.info(f"Pre-VLM chunking produced {len(pre_vlm_chunks)} chunks for {document_stem}")

        # Step 5b: Start enrichment on pre-VLM chunks IN PARALLEL with VLM
        # Uses batching to avoid pydantic serialization deadlock with large documents
        async def run_chunk_enrichment() -> list[Chunk]:
            """Run the chunk enrichment child workflow."""
            # Batch chunks to avoid pydantic serialization deadlock
            batch_size = cfg.SCHWERPUNKT_WORKFLOW_BATCH_SIZE
            batches = [pre_vlm_chunks[i : i + batch_size] for i in range(0, len(pre_vlm_chunks), batch_size)]

            workflow.logger.info(
                f"Running chunk enrichment in {len(batches)} batches ({len(pre_vlm_chunks)} chunks total)"
            )

            # Run batched child workflows in parallel
            batch_results = await asyncio.gather(
                *[
                    workflow.execute_child_workflow(
                        ChunkEnrichmentWorkflow.run,
                        ChunkEnrichmentWorkflowInput(chunks=batch),
                        id=f"chunk-enrichment-{workflow.info().workflow_id}-batch-{i}",
                        id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                        task_queue=workflow.info().task_queue,
                        task_timeout=timedelta(seconds=60),
                    )
                    for i, batch in enumerate(batches)
                ]
            )

            # Merge results from all batches
            all_chunks: list[Chunk] = []
            for result in batch_results:
                all_chunks.extend(result.chunks)

            return all_chunks

        enrichment_task = asyncio.create_task(run_chunk_enrichment())

        # Start summarization in parallel via child workflow
        async def run_summarization() -> SummaryOutput:
            """Run the document summarization child workflow."""
            return await workflow.execute_child_workflow(
                DocumentSummarizationWorkflow.run,
                DocumentSummarizationWorkflowInput(
                    markdown=filtered_results.markdown,
                    workflow_batch_size=cfg.SUMMARIZATION_WORKFLOW_BATCH_SIZE,
                ),
                id=f"doc-summarization-{workflow.info().workflow_id}",
                id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(seconds=60),
            )

        summary_task = asyncio.create_task(run_summarization())

        # Upload images to DMS in parallel (for frontend consumption)
        # filter_enhance uploads images best-effort; check for any that failed
        total_images = len(filtered_results.images)
        uploaded_in_filter = set(filtered_results.image_refs.keys())
        missing_images = {
            name: data for name, data in filtered_results.images.items() if name not in uploaded_in_filter
        }
        if missing_images:
            if uploaded_in_filter:
                workflow.logger.info(
                    f"{len(uploaded_in_filter)}/{total_images} images uploaded in filter_enhance, "
                    f"retrying {len(missing_images)} missing images via fallback activity"
                )
            image_upload_task = asyncio.create_task(
                upload_images_to_dms(
                    images=missing_images,
                    project_id=input.project_id,
                    filename=original_filename,
                )
            )
        else:
            image_upload_task = None
            workflow.logger.info(f"All {total_images} images already uploaded in filter_enhance")

        # Step 5c: Process VLM inputs in batches via child workflow (runs concurrently with enrichment)
        vlm_output = await workflow.execute_child_workflow(
            VLMProcessingWorkflow.run,
            VLMProcessingWorkflowInput(vlm_inputs=vlm_inputs),
            id=f"vlm-batch-{workflow.info().workflow_id}",
            id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
            task_queue=workflow.info().task_queue,
            task_timeout=timedelta(seconds=60),
        )
        vlm_results = vlm_output.vlm_results

        # Apply VLM results to markdown in batches to avoid large payloads
        final_markdown = filtered_results.markdown
        if vlm_results:
            batch_size = cfg.VLM_APPLY_BATCH_SIZE
            for i in range(0, len(vlm_results), batch_size):
                batch = vlm_results[i : i + batch_size]
                final_markdown = await apply_vlm_results(batch, final_markdown)
        # Step 6: Re-chunk with VLM-enhanced markdown (activity to avoid Temporal deadlock)
        final_chunks = await chunk_markdown(final_markdown, filtered_results.content_list)
        workflow.logger.info(f"Post-VLM chunking produced {len(final_chunks)} chunks for {document_stem}")

        # Step 7: Await enrichment and map metadata onto final chunks
        enriched_pre_vlm_chunks = await enrichment_task
        workflow.logger.info(f"Enrichment completed for {document_stem}, mapping metadata to final chunks")
        chunks = _map_enrichment_metadata(enriched_pre_vlm_chunks, final_chunks)

        # Step 8: Fill in pageindex information.
        page_out: MyPageIndexWorkflowOutput = await workflow.execute_child_workflow(
            PageStructureWorkflow.run,
            MyPageIndexWorkflowInput(chunks=chunks),
            id=f"doc-pageindex-{workflow.info().workflow_id}",
            id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
            task_queue=workflow.info().task_queue,
            task_timeout=timedelta(minutes=10),
        )
        chunks = page_out.chunks

        # Await summary BEFORE Step 9 (classification needs it)
        summary_result = await summary_task
        workflow.logger.info(f"Summarization completed for {document_stem}")

        # Step 9: Extract base metadata (priority documents only)
        base_metadata = input.base_metadata
        if input.is_priority_doc:
            workflow.logger.info(f"Starting base metadata extraction for {document_stem}")
            base_metadata = await extract_base_metadata(final_markdown, project_id=str(input.project_id))
            workflow.logger.info(f"Base metadata extraction completed for {document_stem}")

        # Step 10: Classify document based on summary.
        try:
            document_theme_out: ThemeClassificationWorkflowOutput = await workflow.execute_child_workflow(
                ThemeClassificationWorkflow.run,
                ThemeClassificationWorkflowInput(summary=summary_result.summary, theme_info=input.possible_topics),
                id=f"doc-theme_classification-{workflow.info().workflow_id}",
                id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(minutes=10),
            )
            doc_topic: DocumentTopic | None = document_theme_out.topic
        except Exception:
            workflow.logger.exception("Failed to classify document topic, defaulting to None.")
            doc_topic = None
        workflow.logger.info(f"Document theme obtained {doc_topic}")

        # Ensure images are uploaded before declaring document done
        if image_upload_task is not None:
            await image_upload_task
            workflow.logger.info(f"Image upload completed for {document_stem}")

        # Assemble final JSON
        processing_duration = workflow.now().timestamp() - processing_start_time
        final_json_result = await create_final_json(
            CreateFinalJsonInput(
                final_markdown=final_markdown,
                chunks=chunks,
                summary_result=summary_result,
                base_metadata=base_metadata,
                original_filename=original_filename,
                project_id=input.project_id,
                processing_duration_seconds=processing_duration,
                source_file_id=input.file_info.file_id,
                document_theme=doc_topic,
            ),
        )

        processing_duration = workflow.now().timestamp() - processing_start_time
        workflow.logger.info(f"Document processing completed: {document_stem} (Duration: {processing_duration:.1f}s)")

        out = SingleDocumentWorkflowOutput(
            final_json_file_id=final_json_result.final_json_file_id,
            file_id=input.file_info.file_id,
            base_metadata=base_metadata,
            document_name=original_filename,
            document_path=original_filename,
            processed_document=final_json_result.processed_document,
        )
        return SingleDocumentWorkflowOutput.model_validate(_sanitize(out.model_dump()))


ENRICHMENT_METADATA_FIELDS = [
    "focus_topic",
    "wildlife_mentioned",
    "plant_species_mentioned",
    "wildlife_species",
    "plant_species",
    "map_scale",
    "hypothetical_questions",
]


def _map_enrichment_metadata(
    enriched_chunks: list[Chunk],
    target_chunks: list[Chunk],
) -> list[Chunk]:
    """
    Transfer enrichment metadata from pre-VLM to post-VLM chunks.
    Uses greedy ordered walk with Verzeichnispfad + page overlap scoring.
    """
    if not enriched_chunks:
        return target_chunks

    enriched_idx = 0
    result = []

    for target in target_chunks:
        target_path = tuple(target.metadata.get("toc_path", []))
        target_pages = set(target.metadata.get("page_numbers", []))

        # Search a small forward window from current position
        best_idx = enriched_idx
        best_score = _match_score(enriched_chunks[enriched_idx], target_path, target_pages)

        for i in range(enriched_idx + 1, min(enriched_idx + 10, len(enriched_chunks))):
            score = _match_score(enriched_chunks[i], target_path, target_pages)
            if score > best_score:
                best_score = score
                best_idx = i

        # Copy enrichment fields to target chunk + sub_chunks
        _copy_enrichment_fields(enriched_chunks[best_idx], target)

        # Advance pointer (allow staying for 1:N splits)
        enriched_idx = best_idx
        result.append(target)

    if enriched_idx < len(enriched_chunks) - 1:
        workflow.logger.warning(
            f"Enrichment mapping: {len(enriched_chunks) - enriched_idx - 1} "
            f"enriched chunks were not matched to any target chunk"
        )

    return result


def _match_score(enriched_chunk: Chunk, target_path: tuple[str, ...], target_pages: set[int]) -> int:
    """Score how well an enriched chunk matches a final chunk by content overlap."""
    enriched_path = tuple(enriched_chunk.metadata.get("toc_path", []))
    enriched_pages = set(enriched_chunk.metadata.get("page_numbers", []))
    path_match = 1 if enriched_path == target_path else 0
    page_overlap = len(target_pages & enriched_pages) if target_pages and enriched_pages else 0
    return path_match * 1000 + page_overlap


def _copy_enrichment_fields(source: Chunk, target: Chunk) -> None:
    """Copy enrichment metadata fields from a source chunk to a target chunk."""
    for field in ENRICHMENT_METADATA_FIELDS:
        if field in source.metadata:
            target.metadata[field] = source.metadata[field]

    # Propagate to sub_chunks
    updated_sub_chunks = []
    for sub_chunk in target.sub_chunks:
        sub_metadata = {**sub_chunk.metadata}
        for field in ENRICHMENT_METADATA_FIELDS:
            if field in target.metadata:
                sub_metadata[field] = target.metadata[field]
        updated_sub_chunks.append(sub_chunk.model_copy(update={"metadata": sub_metadata}))
    target.sub_chunks = updated_sub_chunks
