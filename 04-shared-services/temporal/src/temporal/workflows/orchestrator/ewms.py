from typing import Any
from uuid import UUID

from pydantic import BaseModel
from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

EWMS_ORCHESTRATOR_TASK_QUEUE = "orchestration"
EWMS_ORCHESTRATOR_WORKFLOW_ID = WorkflowName("EWMSOrchestratorWorkflow")


class EWMSOrchestratorWorkflowInput(BaseModel):
    project_id: UUID
    file_ids: list[UUID]


class EWMSOrchestratorWorkflowOutput(BaseModel):
    pass


async def execute_ewms_orchestrator_workflow(
    input: EWMSOrchestratorWorkflowInput,
    project_id: str | UUID | None = None,
    project_version: int | None = None,
) -> EWMSOrchestratorWorkflowOutput:
    result = await execute_workflow(
        workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
        input=input,
        task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
        project_id=str(project_id) if project_id is not None else None,
        project_version=project_version,
    )
    return EWMSOrchestratorWorkflowOutput.model_validate(result)


async def start_ewms_orchestrator_workflow(
    input: EWMSOrchestratorWorkflowInput,
    project_id: str | UUID | None = None,
    project_version: int | None = None,
    parent_close_policy: workflow.ParentClosePolicy = workflow.ParentClosePolicy.ABANDON,
) -> (
    WorkflowHandle[Any, EWMSOrchestratorWorkflowOutput]
    | ChildWorkflowHandle[Any, EWMSOrchestratorWorkflowOutput]
):
    return await start_workflow(
        workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
        input=input,
        task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
        project_id=project_id,
        project_version=project_version,
        parent_close_policy=parent_close_policy,
    )
