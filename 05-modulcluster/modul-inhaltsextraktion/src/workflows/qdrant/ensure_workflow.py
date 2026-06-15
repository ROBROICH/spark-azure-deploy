"""EnsureQdrantWorkflow — idempotent Qdrant indexing with check-first semantics."""

from datetime import timedelta

from temporal.workflows.inhaltsextraktion.types import (
    EnsureQdrantInput,
    EnsureQdrantOutput,
    ProcessedFileInfo,
    QdrantSourceFileCleanupInput,
    QdrantSourceFileCleanupOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy, WorkflowIDReusePolicy

from src.activities.qdrant.counting import count_qdrant_project_points
from src.activities.qdrant.schemas import QdrantDocumentInput
from src.config import snapshot_config
from src.workflows.qdrant.workflow import (
    QdrantBuilderWorkflow,
    QdrantBuilderWorkflowInput,
)

ENSURE_QDRANT_WORKFLOW_ID_STR = "ensure-qdrant-workflow"
CHECK_QDRANT_INDEXED_WORKFLOW_ID_STR = "check-qdrant-indexed-workflow"
BUILD_QDRANT_FROM_GRAPH_WORKFLOW_ID_STR = "build-qdrant-from-graph-workflow"
QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW_ID_STR = "qdrant-source-file-cleanup-workflow"
QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW_ID_STR = "qdrant-source-file-cleanup-compensation-workflow"
ORCHESTRATION_TASK_QUEUE = "orchestration"


@workflow.defn(name=ENSURE_QDRANT_WORKFLOW_ID_STR)
class EnsureQdrantWorkflow:
    """Check if Qdrant is populated for a project; index if not.

    - If non-deleted points already exist → returns immediately (already_indexed=True).
    - If empty and processed_files are provided → indexes directly.
    - If empty and no data provided → fetches from examination service (cross-queue),
      then indexes.
    """

    @workflow.run
    async def run(self, input: EnsureQdrantInput) -> EnsureQdrantOutput:
        snapshot_config()
        workflow.logger.info("EnsureQdrant for project %s", input.project_id)

        # 1. Get data — inline data is authoritative for incremental re-indexing.
        processed_files = input.processed_files
        if not processed_files:
            count = await count_qdrant_project_points(input.project_id)
            if count > 0:
                workflow.logger.info(
                    "Qdrant already populated for project %s (%d points), skipping.",
                    input.project_id,
                    count,
                )
                return EnsureQdrantOutput(already_indexed=True)

            workflow.logger.info(
                "No inline data for project %s, fetching from examination service.",
                input.project_id,
            )
            processed_files = await workflow.execute_activity(
                "fetch_processed_documents_from_graph",
                input.project_id,
                task_queue=ORCHESTRATION_TASK_QUEUE,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RetryPolicy(
                    maximum_attempts=30,
                    initial_interval=timedelta(seconds=5),
                    backoff_coefficient=2,
                    maximum_interval=timedelta(seconds=60),
                ),
                result_type=list[ProcessedFileInfo],
            )

        if not processed_files:
            workflow.logger.warning(
                "No extraction data found for project %s (inline or examination service).",
                input.project_id,
            )
            return EnsureQdrantOutput(already_indexed=False, indexed_now=False)

        # 2. Map ProcessedFileInfo -> QdrantDocumentInput and run builder
        qdrant_docs = [
            QdrantDocumentInput(
                extraction_file_id=pf.processed_json_file_id,
                project_id=input.project_id,
                processed_document=pf.processed_document,
            )
            for pf in processed_files
            if pf.processed_document is not None
        ]

        if not qdrant_docs:
            workflow.logger.warning("processed_files found but none contain a ProcessedDocument. Skipping indexing.")
            return EnsureQdrantOutput(already_indexed=False, indexed_now=False)

        qdrant_result = await workflow.execute_child_workflow(
            QdrantBuilderWorkflow.run,
            QdrantBuilderWorkflowInput(
                project_id=input.project_id,
                documents=qdrant_docs,
            ),
            id=f"qdrant-builder-{input.project_id}",
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )

        workflow.logger.info(
            "Qdrant indexing complete: %d processed, %d failed.",
            len(qdrant_result.processed_document_ids),
            len(qdrant_result.failed_document_ids),
        )

        return EnsureQdrantOutput(
            indexed_now=True,
            processed_ids=qdrant_result.processed_document_ids,
            failed_ids=qdrant_result.failed_document_ids,
        )


@workflow.defn(name=CHECK_QDRANT_INDEXED_WORKFLOW_ID_STR)
class CheckQdrantIndexedWorkflow:
    """Lightweight check: is Qdrant populated for a project? Returns bool."""

    @workflow.run
    async def run(self, project_id: str) -> bool:
        count = await count_qdrant_project_points(project_id)
        return count > 0


@workflow.defn(name=QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW_ID_STR)
class QdrantSourceFileCleanupWorkflow:
    @workflow.run
    async def run(self, input: QdrantSourceFileCleanupInput) -> QdrantSourceFileCleanupOutput:
        return await workflow.execute_activity(
            "mark_qdrant_source_files_deleted",
            input,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=5),
            result_type=QdrantSourceFileCleanupOutput,
        )


@workflow.defn(name=QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW_ID_STR)
class QdrantSourceFileCleanupCompensationWorkflow:
    @workflow.run
    async def run(self, input: QdrantSourceFileCleanupInput) -> QdrantSourceFileCleanupOutput:
        return await workflow.execute_activity(
            "restore_qdrant_source_files_deleted",
            input,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=5),
            result_type=QdrantSourceFileCleanupOutput,
        )


@workflow.defn(name=BUILD_QDRANT_FROM_GRAPH_WORKFLOW_ID_STR)
class BuildQdrantFromGraphWorkflow:
    """Fetch data from examination service and index into Qdrant. Always indexes, no check."""

    @workflow.run
    async def run(self, project_id: str) -> EnsureQdrantOutput:
        snapshot_config()
        workflow.logger.info("BuildQdrantFromGraph for project %s", project_id)

        processed_files: list[ProcessedFileInfo] = await workflow.execute_activity(
            "fetch_processed_documents_from_graph",
            project_id,
            task_queue=ORCHESTRATION_TASK_QUEUE,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                maximum_attempts=30,
                initial_interval=timedelta(seconds=5),
                backoff_coefficient=2,
                maximum_interval=timedelta(seconds=60),
            ),
            result_type=list[ProcessedFileInfo],
        )

        if not processed_files:
            workflow.logger.warning("No data in examination service for project %s.", project_id)
            return EnsureQdrantOutput(already_indexed=False, indexed_now=False)

        qdrant_docs = [
            QdrantDocumentInput(
                extraction_file_id=pf.processed_json_file_id,
                project_id=project_id,
                processed_document=pf.processed_document,
            )
            for pf in processed_files
            if pf.processed_document is not None
        ]

        if not qdrant_docs:
            workflow.logger.warning("No ProcessedDocuments found. Skipping.")
            return EnsureQdrantOutput(already_indexed=False, indexed_now=False)

        qdrant_result = await workflow.execute_child_workflow(
            QdrantBuilderWorkflow.run,
            QdrantBuilderWorkflowInput(
                project_id=project_id,
                documents=qdrant_docs,
            ),
            id=f"qdrant-builder-{project_id}",
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
        )

        return EnsureQdrantOutput(
            indexed_now=True,
            processed_ids=qdrant_result.processed_document_ids,
            failed_ids=qdrant_result.failed_document_ids,
        )
