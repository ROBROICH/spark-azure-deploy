from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowInput, RechtsmethodikWorkflowOutput
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

RECHTSMETHODIK_WORKFLOW_ID = WorkflowName("RechtsmethodikWorkflow")
TASK_QUEUE = "rechtsmethodik"


async def execute_rechtsmethodik_workflow(
    input: RechtsmethodikWorkflowInput, project_id: str | None = None
) -> RechtsmethodikWorkflowOutput:
    return await execute_workflow(
        workflow_id=RECHTSMETHODIK_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


async def start_rechtsmethodik_workflow(
    input: RechtsmethodikWorkflowInput, project_id: str | None = None
) -> WorkflowHandle[Any, RechtsmethodikWorkflowOutput] | ChildWorkflowHandle[Any, RechtsmethodikWorkflowOutput]:
    return await start_workflow(
        workflow_id=RECHTSMETHODIK_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
