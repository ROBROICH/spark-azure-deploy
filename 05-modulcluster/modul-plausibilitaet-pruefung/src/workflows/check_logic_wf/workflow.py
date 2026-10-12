"""Temporal orchestrator for document-level plausibility checks."""

from datetime import timedelta
from typing import NamedTuple

from temporal.contracts import DMSFileResponse, PlausibilityOrchestratorInput
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import WorkflowIDReusePolicy

from src.activities.dms_activities import (
    AggregateCheckpointsInput,
    aggregate_and_upload_checkpoints,
)
from src.activities.qdrant_activities import get_claim_ids
from src.activities.risk_screener import build_screening_bundles_for_document
from src.config.config import config
from src.workflows.check_logic_wf.pair_reduction import reduce_pairs_project_wide
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleRequest,
    DocumentBundleResult,
)
from src.workflows.check_logic_wf.single_document_workflow import (
    PlausibilityCheckSingleDocumentWorkflow,
)
from src.workflows.input_schemas import CheckSingleDocumentWorkflowInputSchema
from src.workflows.qdrant_wf.schemas.workflow import DocumentActivityInput
from src.workflows.retry import qdrant_retry_policy


class _DocumentRetrieval(NamedTuple):
    """Raw retrieval result of one document, before the project-wide pair reduction."""

    document_id: str
    has_claims: bool
    bundle_result: DocumentBundleResult


@workflow.defn
class PlausibilityCheckOrchestratorWorkflow:
    """Orchestrates document-level plausibility checks and aggregates checkpoints."""

    @workflow.run
    async def run(self, workflow_input: PlausibilityOrchestratorInput) -> DMSFileResponse:
        """Retrieve candidates for all documents, reduce claim pairs project-wide, then check per document."""

        orchestrator_id = workflow.info().workflow_id
        task_queue = workflow.info().task_queue
        # One child per distinct document — the child workflow id below assumes distinctness.
        document_ids = list(dict.fromkeys(workflow_input.document_ids))

        # Phase 1: candidate retrieval only (Qdrant reads, no LLM calls).
        retrievals: list[_DocumentRetrieval] = await sliding_window(
            document_ids,
            lambda doc_id: self._retrieve(workflow_input.project_id, doc_id),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )

        # Phase 2: every unordered claim pair of this run gets exactly one owning document.
        # sliding_window returns in completion order, so restore the document order first.
        by_document = {retrieval.document_id: retrieval for retrieval in retrievals}
        ordered = [by_document[doc_id] for doc_id in document_ids]
        reduced = reduce_pairs_project_wide([retrieval.bundle_result for retrieval in ordered])

        # Phase 3: the check pipeline, one child workflow per document.
        child_inputs = [
            CheckSingleDocumentWorkflowInputSchema(
                project_id=workflow_input.project_id,
                document_id=retrieval.document_id,
                has_claims=retrieval.has_claims,
                bundle_result=bundle_result,
            )
            for retrieval, bundle_result in zip(ordered, reduced, strict=True)
        ]

        checkpoint_file_responses = await sliding_window(
            child_inputs,
            lambda child_input: workflow.execute_child_workflow(
                PlausibilityCheckSingleDocumentWorkflow.run,
                arg=child_input,
                task_queue=task_queue,
                id=f"{orchestrator_id}-doc-{child_input.document_id}",
                id_reuse_policy=WorkflowIDReusePolicy.TERMINATE_IF_RUNNING,
                task_timeout=timedelta(seconds=config.TEMPORAL.WORKFLOW_TASK_TIMEOUT_SECONDS),
            ),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )

        workflow.logger.info("All documents processed and uploaded successfully")
        workflow_info = workflow.info()
        checkpoint_file_ids = [file_response.id for file_response in checkpoint_file_responses]
        aggregation_input = AggregateCheckpointsInput(
            project_id=workflow_input.project_id,
            workflow_id=workflow_info.workflow_id,
            run_id=workflow_info.run_id,
            filename=f"aggregated_plausibility_results_{workflow_info.run_id}.json",
            file_ids=checkpoint_file_ids,
        )
        return await workflow.execute_activity(
            aggregate_and_upload_checkpoints,
            arg=aggregation_input,
            task_queue=workflow.info().task_queue,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )

    async def _retrieve(self, project_id: str, document_id: str) -> _DocumentRetrieval:
        """Claim ids and raw screening bundles of one document — no pair deduplication yet."""
        claim_ids: list[str] = await workflow.execute_activity(
            get_claim_ids,
            arg=DocumentActivityInput(project_id=project_id, document_id=document_id),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=qdrant_retry_policy(),
        )
        if not claim_ids:
            return _DocumentRetrieval(
                document_id=document_id,
                has_claims=False,
                bundle_result=DocumentBundleResult(bundles=[]),
            )

        bundle_result: DocumentBundleResult = await workflow.execute_activity(
            build_screening_bundles_for_document,
            DocumentBundleRequest(
                project_id=project_id,
                document_id=document_id,
                claim_ids=claim_ids,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=qdrant_retry_policy(),
        )
        return _DocumentRetrieval(document_id=document_id, has_claims=True, bundle_result=bundle_result)
