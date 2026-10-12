# src/workflows/process_documents_workflow.py
"""
Temporal workflow for the main document processing pipeline.

This workflow processes documents from DMS (Document Management Service).
Input: List of file_ids and project_id
Output: Summary with processed file information
"""

import asyncio
import unicodedata
from collections.abc import Sequence
from datetime import timedelta
from pathlib import Path

from temporal.contracts import (
    BaseMetadata,
    ProcessDocumentsWorkflowInput,
    ProcessDocumentsWorkflowOutput,
)
from temporal.registry import INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW
from temporal.utils import sliding_window_collect_failures
from temporalio import workflow
from temporalio.common import WorkflowIDReusePolicy
from temporalio.exceptions import ApplicationError

from src.activities.dms_activities import (
    DmsFileInfo,
    dms_get_file_metadata,
    resolve_priority_file,
)
from src.activities.postprocessing import (
    CreateSummaryFromResultsInput,
    create_summary_from_results,
)
from src.config import snapshot_config
from src.env import ENV
from src.workflows.single_document_workflow import (
    SingleDocumentWorkflow,
    SingleDocumentWorkflowInput,
)
from src.workflows.types import SingleDocumentWorkflowOutput


def has_keyword_match(keywords: Sequence[str], file_info: DmsFileInfo) -> bool:
    """Check if a filename matches any skip-keywords."""
    normalized_name = unicodedata.normalize("NFC", Path(file_info.filename).name.lower())
    normalized_keywords = [unicodedata.normalize("NFC", keyword.lower()) for keyword in keywords]
    if any(keyword in normalized_name for keyword in normalized_keywords):
        return True
    # Fallback: ASCII-only matching to handle mojibake/encoding corruption.
    # Filename: strip non-ASCII directly (mojibake chars are garbage).
    # Keywords: NFD first to decompose e.g. ä → a + combining diaeresis,
    # then strip non-ASCII to keep the base letter.
    ascii_name = normalized_name.encode("ascii", "ignore").decode()
    ascii_keywords = [unicodedata.normalize("NFD", k).encode("ascii", "ignore").decode() for k in normalized_keywords]
    return any(keyword in ascii_name for keyword in ascii_keywords if keyword)


@workflow.defn(name=INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW.name)
class ProcessDocumentsWorkflow:
    """
    Processes a list of documents from DMS. For each document, the
    SingleDocumentWorkflow is called. Finds priority documents like
    "Erläuterungsbericht" for base metadata extraction.
    """

    @workflow.run
    async def run(  # noqa: C901
        self, input: ProcessDocumentsWorkflowInput
    ) -> ProcessDocumentsWorkflowOutput:
        """
        Processes a list of documents from DMS, handling priority documents
        and creating a summary file.
        """
        cfg = snapshot_config()
        bounded_retries = workflow.patched("bound-process-documents-retries")
        workflow_start_time = workflow.now()

        file_infos: list[DmsFileInfo] = await asyncio.gather(
            *[dms_get_file_metadata(file_id) for file_id in input.file_ids]
        )
        max_concurrency = max(1, ENV.SINGLE_DOCUMENT_WORKFLOW_CONCURRENCY)

        processable_files: list[DmsFileInfo] = []
        priority_candidates: list[DmsFileInfo] = []
        for file_info in file_infos:
            if cfg.SKIP_DOCUMENTS_BY_KEYWORDS and has_keyword_match(cfg.SKIPPED_DOCUMENT_KEYWORDS, file_info):
                workflow.logger.info(f"Skipping file: {file_info.filename}")
                continue
            suffix = Path(file_info.filename).suffix.lower()
            if suffix not in cfg.ALLOWED_EXTENSIONS:
                continue
            if has_keyword_match(cfg.METADATA_PRIORITY_KEYWORDS, file_info):
                priority_candidates.append(file_info)
                continue
            processable_files.append(file_info)

        priority_file: DmsFileInfo | None = None
        if len(priority_candidates) == 1:
            priority_file = priority_candidates[0]
        elif len(priority_candidates) > 1:
            workflow.logger.warning(
                f"Found {len(priority_candidates)} priority candidates: "
                f"{[c.filename for c in priority_candidates]}. "
                "Resolving by file size."
            )
            try:
                priority_file = await resolve_priority_file(priority_candidates)
                for candidate in priority_candidates:
                    if candidate.file_id != priority_file.file_id:
                        processable_files.append(candidate)
            except Exception as e:
                workflow.logger.error(
                    f"Failed to resolve priority file: {e}. Adding all candidates back to regular processing."
                )
                processable_files.extend(priority_candidates)

        async def _execute_single_doc(
            file_info: DmsFileInfo,
            *,
            is_priority_doc: bool,
            base_metadata: BaseMetadata | None,
        ) -> SingleDocumentWorkflowOutput:
            """Execute a single document child workflow. Raises on failure."""
            child_input = SingleDocumentWorkflowInput(
                project_id=input.project_id,
                file_info=file_info,
                base_metadata=base_metadata,
                is_priority_doc=is_priority_doc,
                possible_topics=input.possible_topics,
            )
            return await workflow.execute_child_workflow(
                SingleDocumentWorkflow.run,
                child_input,
                id=f"single-doc-{file_info.file_id[:8]}-{workflow.info().workflow_id[:8]}",
                id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                task_timeout=timedelta(seconds=60),
            )

        results: list[SingleDocumentWorkflowOutput] = []
        base_metadata = None

        if priority_file:

            async def process_priority(f: DmsFileInfo) -> SingleDocumentWorkflowOutput:
                """Process the priority document to extract base metadata first."""
                return await _execute_single_doc(f, is_priority_doc=True, base_metadata=base_metadata)

            ok_priority, failed_priority = await sliding_window_collect_failures([priority_file], process_priority, 1)
            while failed_priority:
                ok_priority, failed_priority = await sliding_window_collect_failures(
                    failed_priority, process_priority, 1
                )
                if bounded_retries and failed_priority:
                    raise ApplicationError(
                        f"Priority document failed after one retry: {priority_file.filename}",
                        type="PriorityDocumentProcessingFailed",
                        non_retryable=True,
                    )
            results.append(ok_priority[0])
            base_metadata = ok_priority[0].base_metadata

        async def process_one(file_info: DmsFileInfo) -> SingleDocumentWorkflowOutput:
            """Process a single non-priority document."""
            return await _execute_single_doc(file_info, is_priority_doc=False, base_metadata=base_metadata)

        ok, failed = await sliding_window_collect_failures(processable_files, process_one, max_concurrency)
        results.extend(ok)

        while failed:
            retry_results, failed = await sliding_window_collect_failures(failed, process_one, 3)
            results.extend(retry_results)
            if bounded_retries and failed:
                raise ApplicationError(
                    f"{len(failed)} of {len(processable_files)} document(s) failed after one retry: "
                    f"{[file_info.filename for file_info in failed]}",
                    type="DocumentProcessingFailed",
                    non_retryable=True,
                )

        total_docs = len(processable_files) + (1 if priority_file else 0)

        if total_docs == 0:
            raise ApplicationError(
                "No processable documents found",
                type="NoProcessableDocuments",
                non_retryable=True,
            )

        workflow.logger.info(f"{len(results)} of {total_docs} documents processed successfully. Creating summary file.")

        workflow_end_time = workflow.now()
        total_duration_seconds = (workflow_end_time - workflow_start_time).total_seconds()

        summary_result = await create_summary_from_results(
            CreateSummaryFromResultsInput(
                results=results,
                project_id=input.project_id,
                base_metadata=base_metadata,
                total_duration_seconds=total_duration_seconds,
            ),
        )

        return ProcessDocumentsWorkflowOutput(
            summary_file_id=summary_result.summary_file_id,
            summary_data=summary_result.summary_data,
            processed_file_ids=[result.final_json_file_id for result in results],
        )
