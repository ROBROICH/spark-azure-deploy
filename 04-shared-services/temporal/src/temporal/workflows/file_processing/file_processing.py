from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

from .types import FileprocessingOutput, FileProcessingParams

TASK_QUEUE = "dms"
FILEPROCESSING_WORKFLOW_ID = WorkflowName("FileProcessingWorkflow")
SINGLE_FILE_PROCESSING_WORKFLOW_ID = WorkflowName("SingleFileProcessingWorkflow")


async def execute_fileprocessing_workflow(
    input: FileProcessingParams, project_id: str | None = None
) -> FileprocessingOutput:
    return await execute_workflow(
        workflow_id=FILEPROCESSING_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


async def start_fileprocessing_workflow(
    input: FileProcessingParams, project_id: str | None = None
) -> WorkflowHandle[Any, FileprocessingOutput] | ChildWorkflowHandle[Any, FileprocessingOutput]:
    return await start_workflow(
        workflow_id=FILEPROCESSING_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
