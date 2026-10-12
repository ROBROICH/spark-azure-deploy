"""Batch Document Processing Workflow.

This module defines an orchestrator workflow that processes multiple DMS
documents concurrently. For each document, it triggers a single document
workflow, which ultimately delegates to a hybrid extraction pipeline that
intelligently routes pages to either Light ON OCR or Docling depending on
their scan status.
"""

import asyncio
from datetime import timedelta

from temporal.contracts import (
    ProcessDocumentsEWMSWorkflowInput,
    ProcessDocumentsEWMSWorkflowOutput,
    SingleDocumentEWMSWorkflowOutput,
)
from temporal.registry import INHALTSEXTRAKTION_PROCESS_DOCUMENTS_EWMS_WORKFLOW
from temporal.utils import sliding_window_collect_failures
from temporalio import workflow
from temporalio.common import WorkflowIDReusePolicy
from temporalio.exceptions import ApplicationError

from src.activities.dms_activities import DmsFileInfo, dms_get_file_metadata
from src.config import snapshot_config
from src.env import ENV
from src.workflows.single_document_workflow_ewms import SingleDocumentEWMSWorkflow, SingleDocumentEWMSWorkflowInput


@workflow.defn(name=INHALTSEXTRAKTION_PROCESS_DOCUMENTS_EWMS_WORKFLOW.name)
class ProcessDocumentsEWMSWorkflow:
    """Orchestrator workflow for batch processing DMS documents.

    Processes a list of documents from DMS. For each document, a single
    document child workflow is invoked. These downstream child workflows
    manage the actual hybrid extraction (deciding between OCR and Docling
    based on scan status) and text chunking. It also finds priority
    documents like "Erläuterungsbericht" for base metadata extraction.
    """

    @workflow.run
    async def run(self, input: ProcessDocumentsEWMSWorkflowInput) -> ProcessDocumentsEWMSWorkflowOutput:
        """Executes the batch document processing pipeline."""
        snapshot_config()
        bounded_retries = workflow.patched("bound-process-documents-ewms-retries")
        workflow_start_time = workflow.now()

        workflow.logger.info(
            f"Starting batch document processing for project: {input.project_id}. Total files: {len(input.file_ids)}"
        )

        file_infos: list[DmsFileInfo] = await asyncio.gather(
            *[dms_get_file_metadata(file_id) for file_id in input.file_ids]
        )
        max_concurrency = max(1, ENV.SINGLE_DOCUMENT_EWMS_WORKFLOW_CONCURRENCY)

        async def execute_single_doc(
            file_info: DmsFileInfo,
        ) -> SingleDocumentEWMSWorkflowOutput:
            """Executes a single document child workflow.

            This child workflow will ultimately perform the hybrid
            extraction (OCR/Docling). Raises an exception on failure.
            """
            child_input = SingleDocumentEWMSWorkflowInput(
                project_id=input.project_id,
                file_info=file_info,
            )
            return await workflow.execute_child_workflow(
                SingleDocumentEWMSWorkflow.run,
                child_input,
                id=f"single-doc-ewms-{file_info.file_id[:8]}-{workflow.info().workflow_id[:8]}",
                id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                task_timeout=timedelta(seconds=60),
            )

        results: list[SingleDocumentEWMSWorkflowOutput] = []
        ok, failed = await sliding_window_collect_failures(file_infos, execute_single_doc, max_concurrency)
        results.extend(ok)

        while failed:
            workflow.logger.info(f"Retrying {len(failed)} failed document workflows...")
            retry_results, failed = await sliding_window_collect_failures(failed, execute_single_doc, max_concurrency)
            results.extend(retry_results)
            if bounded_retries and failed:
                raise ApplicationError(
                    f"{len(failed)} of {len(file_infos)} document(s) failed after one retry: "
                    f"{[file_info.filename for file_info in failed]}",
                    type="DocumentProcessingFailed",
                    non_retryable=True,
                )

        workflow_end_time = workflow.now()
        total_duration_seconds = (workflow_end_time - workflow_start_time).total_seconds()
        workflow.logger.info(
            f"Batch processing completed successfully: {len(file_infos)} documents (Duration: {total_duration_seconds:.1f}s)"
        )

        return ProcessDocumentsEWMSWorkflowOutput(
            processed_files_output=results,
        )
