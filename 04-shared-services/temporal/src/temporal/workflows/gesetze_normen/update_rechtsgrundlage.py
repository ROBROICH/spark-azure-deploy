from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.gesetze_normen.types import (
    UpdateRechtsgrundlageInput,
    UpdateRechtsgrundlageOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID = WorkflowName("UpdateRechtsgrundlageWorkflow")
TASK_QUEUE = "rechtliche_datenbanken"


async def execute_update_rechtsgrundlage_workflow(
    input: UpdateRechtsgrundlageInput,
    project_id: str | None = None,
) -> UpdateRechtsgrundlageOutput:
    result = await execute_workflow(
        workflow_id=UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return UpdateRechtsgrundlageOutput(**result) if isinstance(result, dict) else result


async def start_update_rechtsgrundlage_workflow(
    input: UpdateRechtsgrundlageInput,
    project_id: str | None = None,
) -> WorkflowHandle[Any, UpdateRechtsgrundlageOutput] | ChildWorkflowHandle[Any, UpdateRechtsgrundlageOutput]:
    return await start_workflow(
        workflow_id=UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
