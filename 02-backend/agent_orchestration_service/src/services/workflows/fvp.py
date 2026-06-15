import asyncio
from typing import Any

from temporal.project_context import current_project_context
from temporal.utils import execute_workflow, start_workflow
from temporal.workflows.agent_orchestration.fvp import FVP_WORKFLOW_ID
from temporal.workflows.inhaltsextraktion.types import DocumentTopic
from temporal.workflows.plausibilitaet_pruefung import (
    PlausibilityOrchestratorInput,
    execute_plausibility_orchestrator_workflow,
)
from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.common import WorkflowIDReusePolicy
from temporalio.exceptions import ApplicationError
from temporalio.workflow import ChildWorkflowHandle

from src.config.settings import settings
from src.models.schemas.files import FileObject
from src.models.schemas.temporal.fvp import (
    DocumentTypeDefinition,
    FullFVPWorkflowInput,
    FVPExtractionWorkflowResult,
    FVPExtractionWorkflowResultItem,
    FVPWorkflowArgs,
)
from src.services.activities.fvp import (
    fetch_existing_dokument_nodes,
    get_formal_completeness_results,
    get_project_files,
    get_template_document_types,
    get_topics,
    mark_toc_document,
)
from src.services.activities.results import (
    send_fvp_results,
    send_plausibility_results,
    send_toc_matching_results,
)
from src.services.workflows.fvp_workflow import (
    FVPClassificationResult,
    apply_document_topic_updates,
    erlaeuterungsbericht_ids_from_fcs_results,
    run_content_extraction_workflows,
    run_fvp_classification_workflows,
    to_result_item,
)
from src.services.workflows.workflow_constants import (
    DEFAULT_RETRY_POLICY,
    DEFAULT_START_TO_CLOSE_TIMEOUT,
    FORMAL_COMPLETENESS,
    PLAUSIBILITY_CHECK,
    TABLE_OF_CONTENTS_MATCHING,
)

TASK_QUEUE = settings.temporal.task_queue


@workflow.defn(name=FVP_WORKFLOW_ID)
class FVPWorkflow:
    """Workflow for running content extraction, formal completeness and plausibility."""

    failed_branches: list[str]
    all_result_items: list[FVPExtractionWorkflowResultItem]

    def __init__(self) -> None:
        self.failed_branches = []
        self.all_result_items = []

    @workflow.run
    async def run(self, args: FVPWorkflowArgs) -> dict[str, Any]:
        workflow.logger.info(f"Starting FVPWorkflow for project: {args.project_id}")

        # Reset on restarts
        self.failed_branches = []
        self.all_result_items = []
        fvp_input = await self._setup_workflow_input(args=args)

        workflow.logger.info(
            f"Found {len(fvp_input.file_ids)} files and {len(fvp_input.candidate_file_ids)} candidates "
            f"for project {args.project_id}. Starting FVP workflow."
        )
        workflow.logger.info("Starting shared FVP extraction flow.")
        if fvp_input.candidate_file_ids:
            await self._handle_content_extraction(fvp_input=fvp_input)
        classification = await self._handle_formal_completeness(fvp_input=fvp_input)
        fcs_results = await workflow.execute_activity(
            get_formal_completeness_results,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )
        await self._handle_plausibility_check(
            fvp_input=fvp_input,
            classification=classification,
            erlaeuterungsbericht_document_ids=erlaeuterungsbericht_ids_from_fcs_results(fcs_results),
        )
        fvp_results = FVPExtractionWorkflowResult(results=self.all_result_items)

        if self.failed_branches:
            raise ApplicationError(
                f"FVPWorkflow failed for project {args.project_id}: {', '.join(self.failed_branches)} failed",
                non_retryable=True,
            )
        return {
            "checks": [result.model_dump(mode="json") for result in fvp_results.results],
        }

    async def _setup_workflow_input(
        self,
        args: FVPWorkflowArgs,
    ) -> FullFVPWorkflowInput:
        """Helper method to get all required data to run whole workflow."""

        template_document_types = await workflow.execute_activity(
            get_template_document_types,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )

        project_files = await workflow.execute_activity(
            get_project_files,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )

        if not project_files:
            raise ApplicationError(
                f"No documents found for project {args.project_id}",
                non_retryable=True,
            )

        document_ids = [str(f.id) for f in project_files]
        current_file_ids = set(document_ids)

        existing_dokumente = await workflow.execute_activity(
            fetch_existing_dokument_nodes,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )
        dokument_by_file_id = {
            str(doc["dms_file_id"]): doc
            for doc in existing_dokumente
            if doc.get("dms_file_id") and str(doc.get("dms_file_id")) in current_file_ids
        }
        project_context = current_project_context()
        if project_context is None:
            raise ValueError("project_context not set, has to be set")
        incremental = project_context.project_version != 1

        incremental_candidate_file_ids = [
            file_id
            for file_id in document_ids
            if file_id not in dokument_by_file_id or bool(dokument_by_file_id[file_id].get("is_outdated"))
        ]
        candidate_file_ids = incremental_candidate_file_ids if incremental else document_ids
        has_toc_document = incremental and any(bool(doc.get("is_toc_document")) for doc in dokument_by_file_id.values())

        project_topics = await workflow.execute_activity(
            get_topics,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )

        return FullFVPWorkflowInput(
            project_id=args.project_id,
            file_ids=document_ids,
            candidate_file_ids=candidate_file_ids,
            dokument_id_by_file_id={file_id: str(doc["id"]) for file_id, doc in dokument_by_file_id.items()},
            has_toc_document=has_toc_document,
            incremental=incremental,
            topics=[DocumentTopic(**topic.model_dump(mode="json")) for topic in project_topics],
            document_types=[
                DocumentTypeDefinition(
                    category=doc_type.category,
                    document_type_name=doc_type.document_type_name,
                    document_type_description=doc_type.document_type_description,
                )
                for doc_type in template_document_types
            ],
        )

    async def _handle_content_extraction(self, fvp_input: FullFVPWorkflowInput, concurrency: int = 10) -> None:
        """Helper method to handle content extraction and store results."""
        try:
            content_extraction = await run_content_extraction_workflows(fvp_input)
        except asyncio.CancelledError:
            workflow.logger.error(f"FVPWorkflow cancelled for project {fvp_input.project_id}")
            raise
        await apply_document_topic_updates(
            content_extraction.summary_data.processed_files,
            concurrency=concurrency,
        )

    async def _handle_formal_completeness(
        self,
        fvp_input: FullFVPWorkflowInput,
    ) -> FVPClassificationResult:
        """Helper method to handle formal completeness and store results."""
        try:
            classification = await run_fvp_classification_workflows(fvp_input)
        except asyncio.CancelledError:
            workflow.logger.error(f"FVPWorkflow cancelled for project {fvp_input.project_id}")
            raise

        for name, result in [
            (FORMAL_COMPLETENESS, classification.formalpruefung_result),
            (
                TABLE_OF_CONTENTS_MATCHING,
                classification.inhaltsverzeichnismatching_result,
            ),
        ]:
            if result is None:
                continue
            item = to_result_item(name, result)
            self.all_result_items.append(item)
            if item.error or item.result is None:
                self.failed_branches.append(name)
                workflow.logger.error(f"{name} failed for project {fvp_input.project_id}: {item.error}")
                continue

            file_object = FileObject(**item.result)
            if name == FORMAL_COMPLETENESS:
                await send_fvp_results(
                    project_id=fvp_input.project_id,
                    file_id=str(file_object.id),
                )
            elif name == TABLE_OF_CONTENTS_MATCHING:
                toc_result = await send_toc_matching_results(
                    project_id=str(file_object.project_id),
                    file_id=str(file_object.id),
                )
                toc_document_id = toc_result.get("toc_document_id")
                if toc_document_id:
                    await workflow.execute_activity(
                        mark_toc_document,
                        args=(fvp_input.project_id, str(toc_document_id)),
                        start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
                        retry_policy=DEFAULT_RETRY_POLICY,
                    )

        return classification

    async def _handle_plausibility_check(
        self,
        fvp_input: FullFVPWorkflowInput,
        classification: FVPClassificationResult,
        erlaeuterungsbericht_document_ids: list[str],
    ) -> None:
        """Helper method to run plausibility checks and store results."""
        try:
            plausibility_result = await execute_plausibility_orchestrator_workflow(
                PlausibilityOrchestratorInput(
                    project_id=fvp_input.project_id,
                    document_ids=fvp_input.file_ids,
                    erlaeuterungsbericht_document_ids=erlaeuterungsbericht_document_ids,
                    classification_file_id=classification.classification_file_id,
                ),
                project_id=fvp_input.project_id,
            )
        except BaseException as e:
            if isinstance(e, asyncio.CancelledError):
                workflow.logger.error(f"PlausibilityOrchestratorWorkflow cancelled for project {fvp_input.project_id}")
                raise
            plausibility_result = e

        plausibility_item = to_result_item(PLAUSIBILITY_CHECK, plausibility_result)
        self.all_result_items.append(plausibility_item)

        if plausibility_item.error or plausibility_item.result is None:
            self.failed_branches.append(PLAUSIBILITY_CHECK)
            workflow.logger.error(
                f"PlausibilityOrchestratorWorkflow failed for project {fvp_input.project_id}: {plausibility_item.error}"
            )
        else:
            file_object = FileObject(**plausibility_item.result)
            await send_plausibility_results(
                project_id=str(file_object.project_id),
                file_id=str(file_object.id),
            )


async def execute_fvp_workflow(input: FVPWorkflowArgs, project_id: str | None = None) -> dict[str, Any]:
    """Executes FVP workflow for a given project."""
    return await execute_workflow(
        workflow_id=FVP_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )


async def start_fvp_workflow(
    input: FVPWorkflowArgs,
    project_id: str | None = None,
    project_version: int | None = None,
) -> WorkflowHandle[Any, dict[str, Any]] | ChildWorkflowHandle[Any, dict[str, Any]]:
    """Starts FVP workflow for a given project."""
    return await start_workflow(
        workflow_id=FVP_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
        project_version=project_version,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )
