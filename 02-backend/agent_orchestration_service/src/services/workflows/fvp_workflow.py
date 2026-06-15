import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from temporal.workflows.formale_pruefung import (
    InhaltsverzeichnisMatchingParams,
    LLMMatchingParams,
)
from temporal.workflows.formale_pruefung.inhaltsverzeichnis_matching import (
    execute_inhaltsverzeichnis_matching_workflow,
)
from temporal.workflows.formale_pruefung.llm_matching import (
    execute_llm_matching_workflow,
)
from temporal.workflows.formale_pruefung.types import DMSFileResponse
from temporal.workflows.inhaltsextraktion.ensure_qdrant import (
    execute_ensure_qdrant_workflow,
)
from temporal.workflows.inhaltsextraktion.process_documents import (
    ProcessDocumentsWorkflowInput,
    execute_process_documents_workflow,
)
from temporal.workflows.inhaltsextraktion.types import (
    EnsureQdrantInput,
    ProcessDocumentsWorkflowOutput,
    ProcessedFileInfo,
)
from temporal.workflows.plausibilitaet_pruefung import (
    PlausibilityOrchestratorInput,
    execute_plausibility_orchestrator_workflow,
)
from temporal.workflows.plausibilitaet_pruefung.types import (
    DMSFileResponse as PlausibilityDMSFileResponse,
)
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.models.schemas.temporal.fvp import (
    FullFVPWorkflowInput,
    FVPExtractionWorkflowResult,
    FVPExtractionWorkflowResultItem,
)
from src.services.activities.fvp import update_file_topics
from src.services.workflows.workflow_constants import (
    CONTENT_EXTRACTION,
    DEFAULT_RETRY_POLICY,
    DEFAULT_START_TO_CLOSE_TIMEOUT,
    FORMAL_COMPLETENESS,
    PLAUSIBILITY_CHECK,
    TABLE_OF_CONTENTS_MATCHING,
)
from src.workflows.insert_extraction_results.types import InsertExtractionResultsInput
from src.workflows.insert_extraction_results.workflow import insert_extraction_results


def _get_result_id(result: object) -> str | None:
    return DMSFileResponse.model_validate(result, from_attributes=True).id


def to_result_item(name: str, result: object) -> FVPExtractionWorkflowResultItem:
    if isinstance(result, BaseException):
        return FVPExtractionWorkflowResultItem(
            workflow_type=name,
            result=None,
            error=str(result),
        )
    result_data: dict[str, Any] | None
    if hasattr(result, "model_dump"):
        result_data = result.model_dump(mode="json")
    else:
        result_data = result if isinstance(result, dict) else None
    return FVPExtractionWorkflowResultItem(
        workflow_type=name,
        result=result_data,
        error=None,
    )


@dataclass
class FVPClassificationResult:
    formalpruefung_result: object | None
    inhaltsverzeichnismatching_result: object | None
    classification_file_id: str | None


def collect_document_topic_updates(
    processed_files: list[ProcessedFileInfo],
) -> list[tuple[str, UUID]]:
    """Collect file/topic pairs emitted by content extraction."""
    updates: list[tuple[str, UUID]] = []

    for processed_file in processed_files:
        processed_document = processed_file.processed_document
        if not processed_document:
            continue

        metadata = processed_document.metadata
        if not metadata.source_file_id or not metadata.document_topic:
            continue

        updates.append((metadata.source_file_id, metadata.document_topic.id))

    return updates


async def apply_document_topic_updates(
    processed_files: list[ProcessedFileInfo],
    concurrency: int = 10,
) -> None:
    """Persist extracted document topics back to DMS file metadata."""
    topic_updates = collect_document_topic_updates(processed_files)
    if not topic_updates:
        return

    semaphore = asyncio.Semaphore(concurrency)

    async def update_single_file(file_id: str, topic_id: UUID) -> None:
        async with semaphore:
            await workflow.execute_activity(
                update_file_topics,
                args=(file_id, [topic_id]),
                start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
                retry_policy=DEFAULT_RETRY_POLICY,
            )

    await asyncio.gather(*(update_single_file(file_id, topic_id) for file_id, topic_id in topic_updates))


async def run_content_extraction_workflows(
    args: FullFVPWorkflowInput,
) -> ProcessDocumentsWorkflowOutput:
    """Run the content extraction workflow."""
    file_ids = args.candidate_file_ids if args.incremental else args.file_ids
    if not file_ids:
        raise ApplicationError("No files provided", non_retryable=True)

    extraction_result = await execute_process_documents_workflow(
        ProcessDocumentsWorkflowInput(
            project_id=UUID(args.project_id),
            file_ids=[UUID(file_id) for file_id in file_ids],
            possible_topics=args.topics,
        ),
        project_id=args.project_id,
    )
    extraction_result = ProcessDocumentsWorkflowOutput.model_validate(extraction_result)

    try:
        await insert_extraction_results(
            InsertExtractionResultsInput(
                project_id=args.project_id,
                processed_files=extraction_result.summary_data.processed_files,
                dokument_id_by_file_id=args.dokument_id_by_file_id,
            )
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        workflow.logger.error(
            "InsertExtractionResultsWorkflow failed for project %s: %s",
            args.project_id,
            exc,
        )

    try:
        await execute_ensure_qdrant_workflow(
            EnsureQdrantInput(
                project_id=args.project_id,
                processed_files=extraction_result.summary_data.processed_files,
            ),
            project_id=args.project_id,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        workflow.logger.error(
            "EnsureQdrantWorkflow failed for project %s: %s",
            args.project_id,
            exc,
        )

    return extraction_result


async def run_fvp_classification_workflows(
    args: FullFVPWorkflowInput,
) -> FVPClassificationResult:
    """Runs document formal completeness check.

    Returns results immediately without waiting for plausibility check.
    """
    document_types = [dt.model_dump(mode="json") for dt in args.document_types]

    formalpruefung_result: object | None = None
    inhaltsverzeichnismatching_result: object | None = None
    workflow_calls: list[Awaitable[DMSFileResponse]] = []

    classification_file_ids = args.candidate_file_ids if args.incremental else args.file_ids

    if classification_file_ids:
        workflow_calls.append(
            execute_llm_matching_workflow(
                LLMMatchingParams(
                    project_id=args.project_id,
                    document_types=document_types,
                    document_ids=classification_file_ids,
                    diplan_preprocessing=args.diplan_preprocessing,
                ),
                project_id=args.project_id,
            )
        )
    if not args.has_toc_document:
        workflow_calls.append(
            execute_inhaltsverzeichnis_matching_workflow(
                InhaltsverzeichnisMatchingParams(
                    project_id=args.project_id,
                    document_types=document_types,
                ),
                project_id=args.project_id,
            )
        )

    if workflow_calls:
        results = await asyncio.gather(*workflow_calls, return_exceptions=True)
        offset = 0
        if classification_file_ids:
            formalpruefung_result = results[offset]
            offset += 1
        if not args.has_toc_document:
            inhaltsverzeichnismatching_result = results[offset]

    classification_file_id = None
    if formalpruefung_result is not None and not isinstance(formalpruefung_result, BaseException):
        classification_file_id = _get_result_id(formalpruefung_result)

    return FVPClassificationResult(
        formalpruefung_result=formalpruefung_result,
        inhaltsverzeichnismatching_result=inhaltsverzeichnismatching_result,
        classification_file_id=classification_file_id,
    )


def erlaeuterungsbericht_ids_from_fcs_results(results: dict[str, Any]) -> list[str]:
    """Extract current Erläuterungsbericht IDs from persisted FCS results."""
    candidates: list[tuple[float, str]] = []
    for entry in results.get("matched_document_types", []):
        required = entry.get("required_document_type") or {}
        if required.get("document_type_name") != "Erläuterungsbericht":
            continue
        for document in entry.get("assigned_documents", []):
            document_id = document.get("document_id")
            if not document_id:
                continue
            candidates.append((float(document.get("confidence") or 0.0), str(document_id)))

    if not candidates:
        return []
    return [max(candidates, key=lambda item: item[0])[1]]


async def run_plausibility_check_workflows(
    args: FullFVPWorkflowInput,
    classification: FVPClassificationResult,
    erlaeuterungsbericht_document_ids: list[str] | None = None,
) -> PlausibilityDMSFileResponse | BaseException:
    """Runs the plausibility check workflow."""
    plausibility_result: PlausibilityDMSFileResponse | BaseException
    try:
        plausibility_result = await execute_plausibility_orchestrator_workflow(
            PlausibilityOrchestratorInput(
                project_id=args.project_id,
                document_ids=args.file_ids,
                erlaeuterungsbericht_document_ids=erlaeuterungsbericht_document_ids or [],
                classification_file_id=classification.classification_file_id,
            ),
            project_id=args.project_id,
        )
    except BaseException as e:
        plausibility_result = e

    return plausibility_result


async def run_fvp_workflow(
    args: FullFVPWorkflowInput,
) -> FVPExtractionWorkflowResult:
    """
    Wrapper function to call:

    - content extraction
    - formal completeness check
    - plausibility check

    Returns all results at the end. Only used in DiPlan.
    """
    content_extraction_result = await run_content_extraction_workflows(args)
    await apply_document_topic_updates(content_extraction_result.summary_data.processed_files)
    classification = await run_fvp_classification_workflows(args)
    plausibility_result = await run_plausibility_check_workflows(args, classification)

    return FVPExtractionWorkflowResult(
        results=[
            to_result_item(CONTENT_EXTRACTION, content_extraction_result),
            to_result_item(FORMAL_COMPLETENESS, classification.formalpruefung_result),
            to_result_item(PLAUSIBILITY_CHECK, plausibility_result),
            to_result_item(
                TABLE_OF_CONTENTS_MATCHING,
                classification.inhaltsverzeichnismatching_result,
            ),
        ]
    )


@workflow.defn()
class IsolatedFVPWorkflow:
    """
    Only used for E2E testing. Started via UI
    """

    @workflow.run
    async def run(self, args: FullFVPWorkflowInput) -> FVPExtractionWorkflowResult:
        return await run_fvp_workflow(args)
