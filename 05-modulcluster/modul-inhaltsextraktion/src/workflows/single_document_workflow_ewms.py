"""Single Document Processing Workflow.

This module orchestrates the processing of a single DMS document. It acts as the
parent workflow that triggers the hybrid extraction child workflow (which dynamically
routes PDF pages to either Light ON OCR or Docling based on scan status) and
subsequently handles the post-processing and chunking of the extracted markdown.
"""

from datetime import timedelta
from pathlib import Path
from uuid import UUID

from prompt_injection.prompt_defense import sanitize_external_data, sanitize_html
from pydantic import BaseModel
from temporal.workflows.inhaltsextraktion.types import PromptInjection, SingleDocumentEWMSWorkflowOutput
from temporalio import workflow
from temporalio.common import WorkflowIDReusePolicy

from src.activities.dms_activities import DmsFileInfo
from src.activities.injection_detection import InjectionDetector, InjectionPrediction
from src.activities.postprocessing.assembly import chunk_markdown_ewms
from src.config import snapshot_config
from src.services.docling.chunk_extraction import replace_images_with_page_markers
from src.workflows.extraction.hybrid_workflow import HybridExtractionWorkflow, HybridExtractionWorkflowInput
from src.workflows.extraction.types import HybridExtractionWorkflowOutput

single_document_workflow_id = "single-document-ewms-workflow"


class SingleDocumentEWMSWorkflowInput(BaseModel):
    """Input schema for processing a single document from the DMS.

    Provides the core metadata required to start the document processing
    pipeline, eventually feeding into the hybrid extraction process.

    Attributes:
        project_id (UUID): The unique identifier of the project.
        file_info (DmsFileInfo): Metadata and storage details of the target PDF file.
    """

    project_id: UUID
    file_info: DmsFileInfo


@workflow.defn(name=single_document_workflow_id)
class SingleDocumentEWMSWorkflow:
    """Main workflow for single document extraction and processing.

    This workflow coordinates the end-to-end processing of a document. It delegates
    the heavy lifting to a hybrid child workflow (which seamlessly handles both
    pure OCR and Docling extractions depending on page scan status) and then
    formats the final markdown into logical chunks.
    """

    @workflow.run
    async def run(self, input: SingleDocumentEWMSWorkflowInput) -> SingleDocumentEWMSWorkflowOutput:
        """Executes the single document processing pipeline."""
        snapshot_config()
        processing_start_time = workflow.now().timestamp()
        document_stem = Path(input.file_info.filename).stem

        workflow.logger.info(f"Starting document processing for: {document_stem}")

        # Step 1: Execute the Hybrid Extraction Child Workflow
        # The child workflow intelligently evaluates scan status to route pages to OCR or Docling
        extraction_result: HybridExtractionWorkflowOutput = await workflow.execute_child_workflow(
            HybridExtractionWorkflow.run,
            HybridExtractionWorkflowInput(
                file_info=input.file_info,
                project_id=input.project_id,
            ),
            id=f"hybrid-extraction-{workflow.info().workflow_id}",
            id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
            task_queue=workflow.info().task_queue,
            task_timeout=timedelta(seconds=60),
        )
        workflow.logger.info(f"Hybrid extraction completed for: {document_stem}")

        markdown = extraction_result.markdown

        # Step 2: Replace image markers (must precede injection detection)
        sanitized_markdown = replace_images_with_page_markers(markdown)

        # Step 3: Strip HTML
        sanitized_markdown = sanitize_html(sanitized_markdown)
        # Step 4: Check for prompt_injection
        injection_detector = InjectionDetector()
        injection_prediction: InjectionPrediction = await injection_detector.predict(sanitized_markdown)
        if injection_prediction.is_attack:
            workflow.logger.warning(
                "Injection detected: file_id=%s score=%.3f is_attack=%s flagged=%d",
                input.file_info.file_id,
                injection_prediction.score,
                injection_prediction.is_attack,
                len(injection_prediction.flagged),
            )
        # Step 5: Pattern sanitization
        # To guarantee the the user sees the same the model receives.
        # Needs to happen after injection_detector to correctly flag the chunks with INJECTION_PATTERNS_HIGH_RISK etc.
        sanitized_markdown = sanitize_external_data(sanitized_markdown)

        # Step 6: Final chunking + per-chunk image marker replacement
        chunks = await chunk_markdown_ewms(markdown=sanitized_markdown)
        workflow.logger.info(f"Markdown chunking completed. Generated {len(chunks)} parent chunks.")
        # Step 7: Calculate duration and return the final assembled output
        processing_duration = workflow.now().timestamp() - processing_start_time
        workflow.logger.info(
            f"Document processing fully completed: {document_stem} (Duration: {processing_duration:.1f}s)"
        )
        first_flagged = injection_prediction.flagged[0] if injection_prediction.flagged else None

        return SingleDocumentEWMSWorkflowOutput(
            prompt_injection=PromptInjection(
                injection_detected=injection_prediction.is_attack,
                snippet=first_flagged.snippet if first_flagged else None,
            ),
            markdown=sanitized_markdown,
            chunks=chunks,
            original_file_id=input.file_info.file_id,
        )
