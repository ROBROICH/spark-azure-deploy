from typing import Any
from uuid import UUID, uuid4

import pytest
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    project_scoped_workflow_id,
    use_project_context,
)
from temporal.utils import start_workflow
from temporalio import activity
from temporalio.api.enums.v1 import IndexedValueType
from temporalio.api.operatorservice.v1 import AddSearchAttributesRequest
from temporalio.client import Client
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.contrib.pydantic import PydanticPayloadConverter
from temporalio.converter import DataConverter
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.workflows.batch_mvp.types import BatchMVPWorkflowInput, NormRef
from src.workflows.batch_mvp.workflow import BATCH_MVP_WORKFLOW_ID, BatchMVPWorkflow

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@activity.defn(name="fetch_project_norms")
async def fetch_project_norms(_project_id: UUID) -> list[NormRef]:
    return []


async def test_batch_mvp_versionless_workflow_id_blocks_second_successful_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    task_queue = f"batch-mvp-{uuid4()}"
    workflow_id = project_scoped_workflow_id(str(BATCH_MVP_WORKFLOW_ID), project_id)
    data_converter = DataConverter(payload_converter_class=PydanticPayloadConverter)

    async with await WorkflowEnvironment.start_local(data_converter=data_converter) as env:
        await env.client.operator_service.add_search_attributes(
            AddSearchAttributesRequest(
                namespace=env.client.namespace,
                search_attributes={
                    PROJECT_ID_SEARCH_ATTRIBUTE.name: IndexedValueType.Value("INDEXED_VALUE_TYPE_KEYWORD"),
                    PROJECT_VERSION_SEARCH_ATTRIBUTE.name: IndexedValueType.Value("INDEXED_VALUE_TYPE_INT"),
                },
            )
        )

        async def get_test_temporal_client(*_args: Any, **_kwargs: Any) -> Client:
            return env.client

        monkeypatch.setattr("temporal.utils.get_temporal_client", get_test_temporal_client)

        async with Worker(
            env.client,
            task_queue=task_queue,
            workflows=[BatchMVPWorkflow],
            activities=[fetch_project_norms],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ):
            with use_project_context(project_id, 1):
                first_handle = await start_workflow(
                    workflow_id=BATCH_MVP_WORKFLOW_ID,
                    input=BatchMVPWorkflowInput(project_id=project_id),
                    task_queue=task_queue,
                    project_id=str(project_id),
                    project_version=1,
                    id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                    id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                    _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
                )

            assert first_handle.id == workflow_id
            assert await first_handle.result() == {"project_id": str(project_id), "results": []}

            with use_project_context(project_id, 2), pytest.raises(WorkflowAlreadyStartedError) as exc_info:
                await start_workflow(
                    workflow_id=BATCH_MVP_WORKFLOW_ID,
                    input=BatchMVPWorkflowInput(project_id=project_id),
                    task_queue=task_queue,
                    project_id=str(project_id),
                    project_version=2,
                    id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                    id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                    _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
                )

            assert exc_info.value.run_id == first_handle.first_execution_run_id
            assert "-v1" not in workflow_id
            assert "-v2" not in workflow_id
