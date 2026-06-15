from uuid import UUID

from temporal.utils import WorkflowName, get_temporal_client
from temporalio.common import Priority, WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import WorkflowAlreadyStartedError

ANONYMISIERUNG_WORKFLOW_ID = WorkflowName("anonymisierung-redaction")
TASK_QUEUE = "anonymisierung"

_PRIORITY_HIGH = Priority(fairness_key="priority", fairness_weight=2.0)


async def execute_anonymisierung_workflow(pdf_data: bytes, request_id: UUID) -> bytes:
    """
    Runs anonymisierung but re-use the result based on the request_id
    """
    client = await get_temporal_client()
    workflow_id = f"anonymize-{request_id}"
    try:
        result = await client.execute_workflow(
            str(ANONYMISIERUNG_WORKFLOW_ID),
            arg=pdf_data,
            id=workflow_id,
            task_queue=TASK_QUEUE,
            result_type=bytes,
            id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
            id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
            priority=_PRIORITY_HIGH,
        )
        return result
    except WorkflowAlreadyStartedError as exc:
        # Workflow already ran (or is running) — get the handle and return its result.
        # If it failed, .result() will re-raise the original error.
        handle = client.get_workflow_handle(
            workflow_id=workflow_id,
            run_id=exc.run_id,
        )
        return await handle.result()
