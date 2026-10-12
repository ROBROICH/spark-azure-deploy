# ruff: noqa: E402
from temporal.observability import ObservabilityConfig, setup_observability, shutdown_observability

from src.activities.deletion import (
    _cleanup_content_extractions_dms,
    _delete_single_document_from_dms,
    _list_project_files_for_deletion,
    _update_summary_for_deleted_documents,
)
from src.activities.hybrid_extraction import _split_pdf_by_scan_status
from src.activities.light_on_ocr.light_on_ocr import _prepare_pdf_page_images
from src.env import ENV
from src.services.docling.plan_extraction import _collect_metrics
from src.workflows.deletion.workflow import DeleteDocumentsWorkflow
from src.workflows.extraction.hybrid_workflow import HybridExtractionWorkflow
from src.workflows.process_documents_ewms_workflow import ProcessDocumentsEWMSWorkflow

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)

import asyncio

from temporal.registry import INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from src.activities.chunk_enrichment import _merge_all_enrichment_results
from src.activities.dms_activities import (
    _delete_file_activity,
    _download_file_activity,
    _get_file_metadata_activity,
    _list_files_activity,
    _resolve_priority_file,
    _upload_file_activity,
)
from src.activities.injection_detection import _injection_llm_chunking, _injection_model_call, _injection_model_chunking
from src.activities.postprocessing.assembly import (
    _chunk_markdown,
    _chunk_markdown_ewms,
    _create_final_json,
    _split_markdown_by_pages,
)
from src.activities.postprocessing.filtering import _filter_enhance_content, _prepare_vlm_inputs_activity
from src.activities.postprocessing.images import _upload_images_to_dms
from src.activities.postprocessing.summary import _create_summary_from_results
from src.activities.preprocessing import _convert_to_pdf_if_needed
from src.activities.qdrant.client import _init_qdrant_collection
from src.activities.qdrant.counting import _count_qdrant_project_points
from src.activities.qdrant.indexing import (
    _delete_document_by_source_file_id,
    _get_inhalts_extraktion_docs,
    _mark_qdrant_source_files_deleted,
    _prepare_qdrant_data,
    _restore_qdrant_source_files_deleted,
    _upload_to_qdrant,
)
from src.activities.vlm_invoke import _prepare_vlm_image
from src.activities.vlm_processing import _apply_vlm_results
from src.services.docling_processing import (
    _combine_docling_chunks,
    _compress_pdf_images,
    _deduplicate_images,
    _download_and_prepare_pdf,
    _extract_chunk_with_docling,
    _rasterize_chunk,
    _split_pdf_for_docling,
    _submit_chunk_to_docling,
    _wait_for_docling_result,
)
from src.workflows.chunk_enrichment.workflow import ChunkEnrichmentWorkflow
from src.workflows.extraction.docling_workflow import DoclingExtractionWorkflow
from src.workflows.hypothetical_questions.workflow import HypotheticalQuestionsWorkflow
from src.workflows.pageindex_structure.workflow import PageStructureWorkflow
from src.workflows.process_documents_workflow import ProcessDocumentsWorkflow
from src.workflows.qdrant.ensure_workflow import (
    BuildQdrantFromGraphWorkflow,
    CheckQdrantIndexedWorkflow,
    EnsureQdrantWorkflow,
    QdrantSourceFileCleanupCompensationWorkflow,
    QdrantSourceFileCleanupWorkflow,
)
from src.workflows.qdrant.workflow import QdrantBuilderWorkflow, QdrantSingleDocWorkflow
from src.workflows.schwerpunkt.workflow import SchwerpunktWorkflow
from src.workflows.single_document_workflow import SingleDocumentWorkflow
from src.workflows.single_document_workflow_ewms import SingleDocumentEWMSWorkflow
from src.workflows.species_scale.workflow import SpeciesScaleWorkflow
from src.workflows.summarization.document_workflow import DocumentSummarizationWorkflow
from src.workflows.summarization.workflow import SummarizationWorkflow
from src.workflows.theme_classification.workflow import ThemeClassificationWorkflow
from src.workflows.vlm_enhancement.batch_workflow import VLMProcessingWorkflow
from src.workflows.vlm_enhancement.workflow import VLMWorkflow

WORKFLOWS = [
    ProcessDocumentsWorkflow,
    SingleDocumentWorkflow,
    DoclingExtractionWorkflow,
    VLMProcessingWorkflow,
    VLMWorkflow,
    DocumentSummarizationWorkflow,
    SummarizationWorkflow,
    SchwerpunktWorkflow,
    HypotheticalQuestionsWorkflow,
    SpeciesScaleWorkflow,
    ChunkEnrichmentWorkflow,
    QdrantBuilderWorkflow,
    QdrantSingleDocWorkflow,
    EnsureQdrantWorkflow,
    CheckQdrantIndexedWorkflow,
    BuildQdrantFromGraphWorkflow,
    QdrantSourceFileCleanupWorkflow,
    QdrantSourceFileCleanupCompensationWorkflow,
    PageStructureWorkflow,
    ThemeClassificationWorkflow,
    DeleteDocumentsWorkflow,
    SingleDocumentEWMSWorkflow,
    HybridExtractionWorkflow,
    ProcessDocumentsEWMSWorkflow,
]

ACTIVITIES = [
    _convert_to_pdf_if_needed,
    _compress_pdf_images,
    _download_and_prepare_pdf,
    _rasterize_chunk,
    _split_pdf_for_docling,
    _extract_chunk_with_docling,
    _submit_chunk_to_docling,
    _wait_for_docling_result,
    _combine_docling_chunks,
    _deduplicate_images,
    _filter_enhance_content,
    _upload_images_to_dms,
    _chunk_markdown,
    _chunk_markdown_ewms,
    _split_markdown_by_pages,
    _prepare_vlm_inputs_activity,
    _apply_vlm_results,
    _create_final_json,
    _create_summary_from_results,
    _merge_all_enrichment_results,
    _prepare_vlm_image,
    _download_file_activity,
    _get_file_metadata_activity,
    _upload_file_activity,
    _list_files_activity,
    _delete_file_activity,
    _resolve_priority_file,
    _get_inhalts_extraktion_docs,
    _count_qdrant_project_points,
    _init_qdrant_collection,
    _prepare_qdrant_data,
    _upload_to_qdrant,
    _mark_qdrant_source_files_deleted,
    _restore_qdrant_source_files_deleted,
    # Delete documents
    _list_project_files_for_deletion,
    _delete_single_document_from_dms,
    _update_summary_for_deleted_documents,
    _delete_document_by_source_file_id,
    _cleanup_content_extractions_dms,
    _split_pdf_by_scan_status,
    _prepare_pdf_page_images,
    _collect_metrics,
    _injection_model_call,
    _injection_model_chunking,
    _injection_llm_chunking,
]


async def main() -> None:
    """Configure S3 payload storage and start the Temporal worker."""
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL_S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL_S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL_S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL_S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL_S3_REGION,
    )
    try:
        await asyncio.gather(
            start_temporal_worker(
                host=ENV.TEMPORAL_SERVER_URL,
                task_queue=INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW.task_queue,
                storage=storage,
                workflows=WORKFLOWS,
                activities=ACTIVITIES,
            ),
        )
    finally:
        shutdown_observability()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
