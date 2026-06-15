from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from temporal.workflows.orchestrator.ewms import (
    EWMS_ORCHESTRATOR_TASK_QUEUE,
    EWMS_ORCHESTRATOR_WORKFLOW_ID,
    EWMSOrchestratorWorkflowInput,
    execute_ewms_orchestrator_workflow,
    start_ewms_orchestrator_workflow,
)
from temporalio import workflow


@pytest.mark.asyncio
async def test_start_ewms_orchestrator_workflow_uses_orchestration_queue(monkeypatch):
    start = AsyncMock()
    monkeypatch.setattr("temporal.workflows.orchestrator.ewms.start_workflow", start)
    project_id = uuid4()
    input_data = EWMSOrchestratorWorkflowInput(
        project_id=project_id,
        file_ids=[uuid4()],
    )

    await start_ewms_orchestrator_workflow(input_data, project_id=project_id, project_version=3)

    start.assert_awaited_once_with(
        workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
        input=input_data,
        task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
        project_id=project_id,
        project_version=3,
        parent_close_policy=workflow.ParentClosePolicy.ABANDON,
    )


@pytest.mark.asyncio
async def test_execute_ewms_orchestrator_workflow_uses_orchestration_queue(monkeypatch):
    execute = AsyncMock(return_value={})
    monkeypatch.setattr("temporal.workflows.orchestrator.ewms.execute_workflow", execute)
    project_id = uuid4()
    input_data = EWMSOrchestratorWorkflowInput(
        project_id=project_id,
        file_ids=[uuid4()],
    )

    await execute_ewms_orchestrator_workflow(input_data, project_id=project_id, project_version=3)

    execute.assert_awaited_once_with(
        workflow_id=EWMS_ORCHESTRATOR_WORKFLOW_ID,
        input=input_data,
        task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
        project_id=str(project_id),
        project_version=3,
    )
