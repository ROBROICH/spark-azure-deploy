from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.gesetze_normen.types import (
    UpdateRechtsgrundlageSourceInput,
    UpdateRechtsgrundlageSourceOutput,
)
from temporal.workflows.gesetze_normen.update_rechtsgrundlage import TASK_QUEUE
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW_ID = WorkflowName("UpdateRechtsgrundlageSource")


async def execute_update_rechtsgrundlage_source_workflow(
    input: UpdateRechtsgrundlageSourceInput,
    project_id: str | None = None,
) -> UpdateRechtsgrundlageSourceOutput:
    result = await execute_workflow(
        workflow_id=UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return UpdateRechtsgrundlageSourceOutput(**result) if isinstance(result, dict) else result


async def start_update_rechtsgrundlage_source_workflow(
    input: UpdateRechtsgrundlageSourceInput,
    project_id: str | None = None,
) -> (
    WorkflowHandle[Any, UpdateRechtsgrundlageSourceOutput]
    | ChildWorkflowHandle[Any, UpdateRechtsgrundlageSourceOutput]
):
    return await start_workflow(
        workflow_id=UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
