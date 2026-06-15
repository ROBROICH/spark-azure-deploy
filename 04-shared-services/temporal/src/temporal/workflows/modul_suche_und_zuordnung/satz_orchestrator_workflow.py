from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.modul_suche_und_zuordnung.types import (
    SatzOrchestratorWorkflowInput,
    SatzOrchestratorWorkflowOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

SATZ_ORCHESTRATOR_WORKFLOW_ID = WorkflowName("satz_orchestrator")
TASK_QUEUE = "modul-suche-und-zuordnung"


async def execute_satz_orchestrator_workflow(
    input: SatzOrchestratorWorkflowInput, project_id: str | None = None
) -> SatzOrchestratorWorkflowOutput:
    return await execute_workflow(
        workflow_id=SATZ_ORCHESTRATOR_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )


async def start_satz_orchestrator_workflow(
    input: SatzOrchestratorWorkflowInput, project_id: str | None = None
) -> WorkflowHandle[Any, SatzOrchestratorWorkflowOutput] | ChildWorkflowHandle[Any, SatzOrchestratorWorkflowOutput]:
    return await start_workflow(
        workflow_id=SATZ_ORCHESTRATOR_WORKFLOW_ID, input=input, task_queue=TASK_QUEUE, project_id=project_id
    )
