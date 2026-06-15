from typing import Any

from temporal.utils import execute_workflow, start_workflow
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

from .types import (
    ARGUMENT_CLASSIFICATION_WORKFLOW_ID,
    TASK_QUEUE,
    ArgumentClassificationOutput,
    ArgumentClassificationParams,
)


async def execute_argument_classification_workflow(
    input: ArgumentClassificationParams, project_id: str | None = None
) -> ArgumentClassificationOutput:
    return await execute_workflow(
        workflow_id=ARGUMENT_CLASSIFICATION_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


async def start_argument_classification_workflow(
    input: ArgumentClassificationParams, project_id: str | None = None
) -> WorkflowHandle[Any, ArgumentClassificationOutput] | ChildWorkflowHandle[Any, ArgumentClassificationOutput]:
    return await start_workflow(
        workflow_id=ARGUMENT_CLASSIFICATION_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
