from typing import Any

from temporal.utils import execute_workflow, start_workflow
from temporal.workflows.inhaltsextraktion.types import (
    PROCESS_DOCUMENTS_WORKFLOW_ID,
    TASK_QUEUE,
    ProcessDocumentsWorkflowInput,
    ProcessDocumentsWorkflowOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle


async def execute_process_documents_workflow(
    input: ProcessDocumentsWorkflowInput, project_id: str | None = None
) -> ProcessDocumentsWorkflowOutput:
    result = await execute_workflow(
        workflow_id=PROCESS_DOCUMENTS_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
    return ProcessDocumentsWorkflowOutput(**result)


async def start_process_documents_workflow(
    input: ProcessDocumentsWorkflowInput, project_id: str | None = None
) -> WorkflowHandle[Any, ProcessDocumentsWorkflowOutput] | ChildWorkflowHandle[Any, ProcessDocumentsWorkflowOutput]:
    return await start_workflow(
        workflow_id=PROCESS_DOCUMENTS_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
