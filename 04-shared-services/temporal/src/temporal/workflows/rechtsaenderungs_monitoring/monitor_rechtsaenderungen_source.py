from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.rechtsaenderungs_monitoring.monitor_rechtsaenderungen import TASK_QUEUE
from temporal.workflows.rechtsaenderungs_monitoring.types import (
    MonitorRechtsaenderungenInput,
    MonitorRechtsaenderungenOutput,
)
from temporalio.client import WorkflowHandle
from temporalio.workflow import ChildWorkflowHandle

MONITOR_RECHTSAENDERUNGEN_SOURCE_WORKFLOW_ID = WorkflowName("MonitorRechtsaenderungenSourceWorkflow")


async def execute_monitor_rechtsaenderungen_source_workflow(
    input: MonitorRechtsaenderungenInput,
    project_id: str | None = None,
) -> MonitorRechtsaenderungenOutput:
    result = await execute_workflow(
        workflow_id=MONITOR_RECHTSAENDERUNGEN_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return MonitorRechtsaenderungenOutput(**result) if isinstance(result, dict) else result


async def start_monitor_rechtsaenderungen_source_workflow(
    input: MonitorRechtsaenderungenInput,
    project_id: str | None = None,
) -> (
    WorkflowHandle[Any, MonitorRechtsaenderungenOutput]
    | ChildWorkflowHandle[Any, MonitorRechtsaenderungenOutput]
):
    return await start_workflow(
        workflow_id=MONITOR_RECHTSAENDERUNGEN_SOURCE_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
