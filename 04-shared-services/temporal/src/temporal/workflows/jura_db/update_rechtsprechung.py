from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.jura_db.types import (
    UpdateRechtsprechungInput,
    UpdateRechtsprechungOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

UPDATE_RECHTSPRECHUNG_WORKFLOW_ID = WorkflowName("UpdateRechtsprechungWorkflow")
TASK_QUEUE = "rechtsprechung"


async def execute_update_rechtsprechung_workflow(
    input: UpdateRechtsprechungInput,
    project_id: str | None = None,
) -> UpdateRechtsprechungOutput:
    result = await execute_workflow(
        workflow_id=UPDATE_RECHTSPRECHUNG_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return UpdateRechtsprechungOutput(**result) if isinstance(result, dict) else result


async def start_update_rechtsprechung_workflow(
    input: UpdateRechtsprechungInput,
    project_id: str | None = None,
) -> WorkflowHandle[Any, UpdateRechtsprechungOutput] | ChildWorkflowHandle[Any, UpdateRechtsprechungOutput]:
    return await start_workflow(
        workflow_id=UPDATE_RECHTSPRECHUNG_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
