"""Helper functions to start or execute the NormErmittlung workflow from external callers."""

from typing import Optional

from temporal.workflows.modul_normenermittlung.main_types import (
    NormErmittlungInput,
    NormSelectionResult,
)
from temporalio.client import Client, WorkflowHandle
from ulid import ULID

main_workflow_id = "normermittlung_workflow"
task_queue = "normermittlung"


async def execute_main_workflow(
    client: Client,
    input: NormErmittlungInput,
    workflow_id: Optional[str] = None,
) -> NormSelectionResult:
    """Execute the NormErmittlung workflow and wait for the result.

    Args:
        client: Temporal client.
        input: Workflow input with project_id.
        workflow_id: Optional custom workflow ID. Auto-generated if omitted.

    Returns:
        NormSelectionResult with applicable norms.
    """
    return await client.execute_workflow(
        main_workflow_id,
        input,
        id=workflow_id or f"normermittlung-{ULID()}",
        task_queue=task_queue,
    )


async def start_main_workflow(
    client: Client,
    input: NormErmittlungInput,
    workflow_id: Optional[str] = None,
) -> WorkflowHandle[Client, NormSelectionResult]:
    """Start the NormErmittlung workflow without waiting for the result.

    Args:
        client: Temporal client.
        input: Workflow input with project_id.
        workflow_id: Optional custom workflow ID. Auto-generated if omitted.

    Returns:
        WorkflowHandle that can be awaited or queried later.
    """
    return await client.start_workflow(
        main_workflow_id,
        input,
        id=workflow_id or f"normermittlung-{ULID()}",
        task_queue=task_queue,
    )
