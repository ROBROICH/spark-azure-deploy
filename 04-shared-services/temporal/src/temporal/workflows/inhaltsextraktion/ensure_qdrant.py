from typing import Any

from temporal.utils import execute_workflow, start_workflow
from temporal.workflows.inhaltsextraktion.types import (
    BUILD_QDRANT_FROM_GRAPH_WORKFLOW_ID,
    CHECK_QDRANT_INDEXED_WORKFLOW_ID,
    ENSURE_QDRANT_WORKFLOW_ID,
    QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW_ID,
    QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW_ID,
    TASK_QUEUE,
    EnsureQdrantInput,
    EnsureQdrantOutput,
    QdrantSourceFileCleanupInput,
    QdrantSourceFileCleanupOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

# ── ensure_qdrant: check + index if needed ────────────────────────────────────


async def execute_ensure_qdrant_workflow(
    input: EnsureQdrantInput, project_id: str | None = None
) -> EnsureQdrantOutput:
    result = await execute_workflow(
        workflow_id=ENSURE_QDRANT_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
    return EnsureQdrantOutput(**result)


async def start_ensure_qdrant_workflow(
    input: EnsureQdrantInput, project_id: str | None = None
) -> WorkflowHandle[Any, EnsureQdrantOutput] | ChildWorkflowHandle[Any, EnsureQdrantOutput]:
    return await start_workflow(
        workflow_id=ENSURE_QDRANT_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


# ── check_qdrant_indexed: lightweight check only ─────────────────────────────


async def execute_check_qdrant_indexed(
    project_id: str,
) -> bool:
    """Check if Qdrant has data for a project. Returns True/False, no indexing."""
    result = await execute_workflow(
        workflow_id=CHECK_QDRANT_INDEXED_WORKFLOW_ID, input=project_id, task_queue=TASK_QUEUE, project_id=project_id
    )
    return bool(result)


# ── build_qdrant_from_graph: fetch from exam service + index ──────────────────


async def execute_build_qdrant_from_graph(
    project_id: str,
) -> EnsureQdrantOutput:
    """Fetch data from examination service and index into Qdrant. No check — always indexes."""
    result = await execute_workflow(
        workflow_id=BUILD_QDRANT_FROM_GRAPH_WORKFLOW_ID, input=project_id, task_queue=TASK_QUEUE, project_id=project_id
    )
    return EnsureQdrantOutput(**result)


async def execute_qdrant_source_file_cleanup(
    input: QdrantSourceFileCleanupInput, project_id: str | None = None
) -> QdrantSourceFileCleanupOutput:
    result = await execute_workflow(
        workflow_id=QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return QdrantSourceFileCleanupOutput(**result)


async def execute_qdrant_source_file_cleanup_compensation(
    input: QdrantSourceFileCleanupInput, project_id: str | None = None
) -> QdrantSourceFileCleanupOutput:
    result = await execute_workflow(
        workflow_id=QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return QdrantSourceFileCleanupOutput(**result)
