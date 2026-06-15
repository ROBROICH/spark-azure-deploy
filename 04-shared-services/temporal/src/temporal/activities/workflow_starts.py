from datetime import timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from temporalio import activity
from temporalio.common import WorkflowIDReusePolicy

from temporal.utils import WorkflowName, start_workflow


class StartDecoupledParentWorkflowInput(BaseModel):
    workflow_id: str
    workflow_input: Any
    task_queue: str
    project_id: str | UUID | None = None
    project_version: int | None = None
    task_timeout_seconds: float = 60
    id_reuse_policy: WorkflowIDReusePolicy = WorkflowIDReusePolicy.ALLOW_DUPLICATE


@activity.defn
async def start_decoupled_parent_workflow(
    activity_input: StartDecoupledParentWorkflowInput,
) -> str:
    handle = await start_workflow(
        workflow_id=WorkflowName(activity_input.workflow_id),
        input=activity_input.workflow_input,
        task_queue=activity_input.task_queue,
        project_id=activity_input.project_id,
        project_version=activity_input.project_version,
        task_timeout=timedelta(seconds=activity_input.task_timeout_seconds),
        id_reuse_policy=activity_input.id_reuse_policy,
    )
    return handle.id
