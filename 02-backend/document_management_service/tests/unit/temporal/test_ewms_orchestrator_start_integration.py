import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from temporal import worker as temporal_worker
from temporal.activities.workflow_starts import start_decoupled_parent_workflow
from temporal.interceptors.context_interceptor import ContextInterceptor
from temporal.project_context import (
    ProjectContext,
    current_project_context,
)
from temporal.workflows.orchestrator.ewms import (
    EWMS_ORCHESTRATOR_TASK_QUEUE,
    EWMS_ORCHESTRATOR_WORKFLOW_ID,
    EWMSOrchestratorWorkflowInput,
    EWMSOrchestratorWorkflowOutput,
    start_ewms_orchestrator_workflow,
)
from temporalio import activity, workflow
from temporalio.api.enums.v1 import EventType, IndexedValueType
from temporalio.api.operatorservice.v1 import AddSearchAttributesRequest
from temporalio.client import Client
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import ActionEnum
from src.services.workflows.activities.activity_models import (
    ComputeDiffInput,
    ExtractZipInput,
    FileDiffResult,
    IngestFileInput,
    NewFile,
    SingleFileResult,
    UpdateFileStatusInput,
    ValidateZipInput,
)
from src.services.workflows.file_processing import FileProcessingWorkflow
from src.services.workflows.workflow_models import FileProcessingInput

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

INGESTED_FILE_ID = UUID("11111111-1111-1111-1111-111111111111")
PROJECT_CONTEXT_TEST_VERSION = 7


@activity.defn(name="update_file_status")
async def fake_update_file_status(_: UpdateFileStatusInput) -> None:
    return None


@activity.defn(name="validate_zip")
async def fake_validate_zip(_: ValidateZipInput) -> None:
    return None


@activity.defn(name="extract_zip")
async def fake_extract_zip(_: ExtractZipInput) -> list[SingleFileResult]:
    return [
        SingleFileResult(
            success=True,
            filename="E1234.pdf",
            action=ActionEnum.UNZIP,
            bucket_path="tmp/E1234.pdf",
        )
    ]


@activity.defn(name="create_diff")
async def fake_create_diff(_: ComputeDiffInput) -> FileDiffResult:
    return FileDiffResult(
        new=[
            NewFile(
                filename="E1234.pdf",
                bucket_path="tmp/E1234.pdf",
                sha="sha",
            )
        ]
    )


@activity.defn(name="ingest_file")
async def fake_ingest_file(activity_input: IngestFileInput) -> SingleFileResult:
    return SingleFileResult(
        success=True,
        filename=activity_input.filename,
        action=ActionEnum.INGEST,
        file_id=str(INGESTED_FILE_ID),
        bucket_path=activity_input.bucket_path,
    )


@activity.defn(name="assert_ewms_project_context")
async def assert_ewms_project_context(expected: ProjectContext) -> None:
    if current_project_context() != expected:
        raise ValueError(f"Unexpected project context: {current_project_context()}")


@workflow.defn(name=EWMS_ORCHESTRATOR_WORKFLOW_ID)
class ProjectContextAssertingEWMSOrchestratorWorkflow:
    @workflow.run
    async def run(self, input: EWMSOrchestratorWorkflowInput) -> EWMSOrchestratorWorkflowOutput:
        if input.file_ids != [INGESTED_FILE_ID]:
            raise ValueError(f"Unexpected EWMS file ids: {input.file_ids}")

        expected = ProjectContext(
            project_id=str(input.project_id),
            project_version=PROJECT_CONTEXT_TEST_VERSION,
        )
        if current_project_context() != expected:
            raise ValueError(f"Unexpected EWMS workflow project context: {current_project_context()}")

        await workflow.execute_activity(
            assert_ewms_project_context,
            expected,
            start_to_close_timeout=timedelta(seconds=5),
        )
        return EWMSOrchestratorWorkflowOutput()


@workflow.defn(name=EWMS_ORCHESTRATOR_WORKFLOW_ID)
class StubEWMSOrchestratorWorkflow:
    @workflow.run
    async def run(self, input: EWMSOrchestratorWorkflowInput) -> EWMSOrchestratorWorkflowOutput:
        if input.file_ids != [INGESTED_FILE_ID]:
            raise ValueError(f"Unexpected EWMS file ids: {input.file_ids}")
        return EWMSOrchestratorWorkflowOutput()


@workflow.defn(name="DirectEWMSStartWorkflow")
class DirectEWMSStartWorkflow:
    @workflow.run
    async def run(self, input: EWMSOrchestratorWorkflowInput) -> None:
        await start_ewms_orchestrator_workflow(input=input)


async def test_file_processing_starts_ewms_orchestrator_child_workflow() -> None:
    project_id = uuid4()
    project_version = PROJECT_CONTEXT_TEST_VERSION
    parent_workflow_id = f"file-processing-{uuid4()}"
    dms_task_queue = f"dms-file-processing-{uuid4()}"

    async with await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env:
        await env.client.operator_service.add_search_attributes(
            AddSearchAttributesRequest(
                namespace=env.client.namespace,
                search_attributes={
                    "ProjectId": IndexedValueType.Value("INDEXED_VALUE_TYPE_KEYWORD"),
                    "ProjectVersion": IndexedValueType.Value("INDEXED_VALUE_TYPE_INT"),
                },
            )
        )
        previous_client = temporal_worker._client
        temporal_client = await Client.connect(
            target_host=env.client.service_client.config.target_host,
            namespace=env.client.namespace,
            data_converter=pydantic_data_converter,
            interceptors=[ContextInterceptor(pydantic_data_converter.payload_converter)],
        )
        temporal_worker._client = temporal_client
        try:
            async with (
                Worker(
                    temporal_client,
                    task_queue=dms_task_queue,
                    workflows=[FileProcessingWorkflow],
                    activities=[
                        fake_update_file_status,
                        fake_validate_zip,
                        fake_extract_zip,
                        fake_create_diff,
                        fake_ingest_file,
                        start_decoupled_parent_workflow,
                    ],
                    interceptors=[ContextInterceptor(temporal_client.data_converter.payload_converter)],
                    workflow_runner=UnsandboxedWorkflowRunner(),
                ),
                Worker(
                    temporal_client,
                    task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
                    workflows=[ProjectContextAssertingEWMSOrchestratorWorkflow],
                    activities=[assert_ewms_project_context],
                    interceptors=[ContextInterceptor(temporal_client.data_converter.payload_converter)],
                    workflow_runner=UnsandboxedWorkflowRunner(),
                ),
            ):
                parent_handle = await temporal_client.start_workflow(
                    FileProcessingWorkflow.run,
                    FileProcessingInput(
                        file_id=str(uuid4()),
                        filename="ewms.zip",
                        project_id=str(project_id),
                        file_type=FileTypeEnum.EWMS_ZIP.value,
                        zip_path="tmp/ewms.zip",
                        entry_file_type=FileTypeEnum.EWMS_DOCUMENT.value,
                        source_project_version=project_version,
                    ),
                    id=parent_workflow_id,
                    task_queue=dms_task_queue,
                )

                await asyncio.wait_for(parent_handle.result(), timeout=10)
                parent_history = await parent_handle.fetch_history()
                child_start_events = [
                    event
                    for event in parent_history.events
                    if event.event_type == EventType.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED
                ]
                assert len(child_start_events) == 1
                child_workflow_id = child_start_events[
                    0
                ].start_child_workflow_execution_initiated_event_attributes.workflow_id

                orchestrator_handle = temporal_client.get_workflow_handle(child_workflow_id)
                await asyncio.wait_for(orchestrator_handle.result(), timeout=10)

                orchestrator_description = await orchestrator_handle.describe()
                assert orchestrator_description.workflow_type == EWMS_ORCHESTRATOR_WORKFLOW_ID
                assert orchestrator_description.task_queue == EWMS_ORCHESTRATOR_TASK_QUEUE
                assert orchestrator_description.parent_id == parent_workflow_id
                assert orchestrator_description.parent_run_id is not None

                parent_workflows = [
                    execution async for execution in temporal_client.list_workflows("`ParentWorkflowId` IS null")
                ]
                assert len(parent_workflows) == 1
                assert {execution.id for execution in parent_workflows} == {parent_workflow_id}
        finally:
            temporal_worker._client = previous_client


async def test_workflow_direct_start_creates_child_workflow() -> None:
    project_id = uuid4()
    parent_workflow_id = f"direct-ewms-start-{uuid4()}"
    dms_task_queue = f"direct-ewms-start-{uuid4()}"

    async with (
        await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env,
        Worker(
            env.client,
            task_queue=dms_task_queue,
            workflows=[DirectEWMSStartWorkflow],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
        Worker(
            env.client,
            task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
            workflows=[StubEWMSOrchestratorWorkflow],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ),
    ):
        parent_handle = await env.client.start_workflow(
            DirectEWMSStartWorkflow.run,
            EWMSOrchestratorWorkflowInput(
                project_id=project_id,
                file_ids=[INGESTED_FILE_ID],
            ),
            id=parent_workflow_id,
            task_queue=dms_task_queue,
        )

        await asyncio.wait_for(parent_handle.result(), timeout=10)

        parent_history = await parent_handle.fetch_history()
        child_start_events = [
            event
            for event in parent_history.events
            if event.event_type == EventType.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED
        ]
        assert len(child_start_events) == 1
        child_workflow_id = child_start_events[0].start_child_workflow_execution_initiated_event_attributes.workflow_id

        child_handle = env.client.get_workflow_handle(child_workflow_id)
        child_description = await child_handle.describe()
        assert child_description.workflow_type == EWMS_ORCHESTRATOR_WORKFLOW_ID
        assert child_description.parent_id == parent_workflow_id
        assert child_description.parent_run_id == parent_handle.result_run_id

        parent_workflows = [execution async for execution in env.client.list_workflows("`ParentWorkflowId` IS null")]
        assert len(parent_workflows) == 1
        assert {execution.id for execution in parent_workflows} == {parent_workflow_id}
