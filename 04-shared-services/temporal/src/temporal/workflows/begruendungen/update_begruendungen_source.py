from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.begruendungen.types import (
    UpdateBegruendungenSourceInput,
    UpdateBegruendungenSourceOutput,
)
from temporal.workflows.begruendungen.update_begruendungen import TASK_QUEUE
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

UPDATE_BEGRUENDUNGEN_SOURCE_WORKFLOW_ID = WorkflowName("UpdateBegruendungenSourceWorkflow")


async def execute_update_begruendungen_source_workflow(
    input: UpdateBegruendungenSourceInput,
    project_id: str | None = None,
) -> UpdateBegruendungenSourceOutput:
    result = await execute_workflow(
        workflow_id=UPDATE_BEGRUENDUNGEN_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return UpdateBegruendungenSourceOutput(**result) if isinstance(result, dict) else result


async def start_update_begruendungen_source_workflow(
    input: UpdateBegruendungenSourceInput,
    project_id: str | None = None,
) -> WorkflowHandle[Any, UpdateBegruendungenSourceOutput] | ChildWorkflowHandle[Any, UpdateBegruendungenSourceOutput]:
    return await start_workflow(
        workflow_id=UPDATE_BEGRUENDUNGEN_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
