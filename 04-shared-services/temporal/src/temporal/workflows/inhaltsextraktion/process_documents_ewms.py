from typing import Any

from temporal.utils import execute_workflow, start_workflow
from temporal.workflows.inhaltsextraktion.types import (
    PROCESS_DOCUMENTS_EWMS_WORKFLOW_ID,
    TASK_QUEUE,
    ProcessDocumentsEWMSWorkflowInput,
    ProcessDocumentsEWMSWorkflowOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle


async def execute_process_documents_ewms_workflow(
    input: ProcessDocumentsEWMSWorkflowInput, project_id: str | None = None
) -> ProcessDocumentsEWMSWorkflowOutput:
    result = await execute_workflow(
        workflow_id=PROCESS_DOCUMENTS_EWMS_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
    return ProcessDocumentsEWMSWorkflowOutput(**result)


async def start_process_documents_ewms_workflow(
    input: ProcessDocumentsEWMSWorkflowInput, project_id: str | None = None
) -> (
    WorkflowHandle[Any, ProcessDocumentsEWMSWorkflowOutput]
    | ChildWorkflowHandle[Any, ProcessDocumentsEWMSWorkflowOutput]
):
    return await start_workflow(
        workflow_id=PROCESS_DOCUMENTS_EWMS_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
