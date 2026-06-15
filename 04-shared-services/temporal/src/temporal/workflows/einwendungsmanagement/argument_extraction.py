from typing import Any

from temporal.utils import execute_workflow, start_workflow
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

from .types import ARGUMENT_EXTRACTION_WORKFLOW_ID, TASK_QUEUE, ArgumentExtractionOutput, ArgumentExtractionParams


async def execute_argument_extraction_workflow(
    input: ArgumentExtractionParams, project_id: str | None = None
) -> ArgumentExtractionOutput:
    return await execute_workflow(
        workflow_id=ARGUMENT_EXTRACTION_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


async def start_argument_extraction_workflow(
    input: ArgumentExtractionParams, project_id: str | None = None
) -> WorkflowHandle[Any, ArgumentExtractionOutput] | ChildWorkflowHandle[Any, ArgumentExtractionOutput]:
    return await start_workflow(
        workflow_id=ARGUMENT_EXTRACTION_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
