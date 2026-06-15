from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.begruendungen.types import (
    UpdateBegruendungenInput,
    UpdateBegruendungenOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

UPDATE_BEGRUENDUNGEN_WORKFLOW_ID = WorkflowName("UpdateBegruendungenWorkflow")
TASK_QUEUE = "begruendungen_db"


async def execute_update_begruendungen_workflow(
    input: UpdateBegruendungenInput,
    project_id: str | None = None,
) -> UpdateBegruendungenOutput:
    result = await execute_workflow(
        workflow_id=UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return UpdateBegruendungenOutput(**result) if isinstance(result, dict) else result


async def start_update_begruendungen_workflow(
    input: UpdateBegruendungenInput,
    project_id: str | None = None,
) -> WorkflowHandle[Any, UpdateBegruendungenOutput] | ChildWorkflowHandle[Any, UpdateBegruendungenOutput]:
    return await start_workflow(
        workflow_id=UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
