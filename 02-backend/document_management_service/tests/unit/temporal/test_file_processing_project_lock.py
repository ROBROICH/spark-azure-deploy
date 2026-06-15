from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from temporal import worker as temporal_worker
from temporal.interceptors.context_interceptor import ContextInterceptor
from temporalio.api.enums.v1 import IndexedValueType
from temporalio.api.operatorservice.v1 import AddSearchAttributesRequest
from temporalio.client import Client
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from tests.unit.conftest import MockStorageProviderService

from src.models.db.db_models import ZipFile
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.file_schema import StartFileProcessingRequest
from src.services.files.file_service import FileService
from src.utils.exceptions import WorkflowInRunningStateError

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_zip_file_processing_is_locked_to_one_open_workflow_per_project(db_session) -> None:
    project_id = uuid4()
    first_zip = ZipFile(
        filename="first.zip",
        bucket_path=f"zips/{project_id}/v1/first.zip",
        project_id=project_id,
        type=FileTypeEnum.ZIP,
        workflow_status=WorkflowStatusEnum.FAILED,
    )
    second_zip = ZipFile(
        filename="second.zip",
        bucket_path=f"zips/{project_id}/v1/second.zip",
        project_id=project_id,
        type=FileTypeEnum.ZIP,
        workflow_status=WorkflowStatusEnum.FAILED,
    )
    db_session.add_all([first_zip, second_zip])
    await db_session.flush()

    service = FileService(
        db=db_session,
        storage_provider_service=MockStorageProviderService(),
    )
    service._get_latest_project_version = AsyncMock(return_value=1)

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
        first_handle = None
        try:
            first_start = await service.start_file_processing(
                StartFileProcessingRequest(file_id=first_zip.id, project_id=project_id)
            )
            assert first_start.workflow_id == f"FileProcessingWorkflow-{project_id}"
            first_handle = temporal_client.get_workflow_handle(
                first_start.workflow_id,
                run_id=first_start.run_id,
            )

            await db_session.refresh(first_zip)
            assert first_zip.workflow_status == WorkflowStatusEnum.RUNNING

            # Simulate both ZIP start requests passing the DB status check before
            # either path has durably exposed its running state.
            first_zip.workflow_status = WorkflowStatusEnum.FAILED
            await db_session.commit()

            with pytest.raises(WorkflowInRunningStateError, match="already running"):
                await service.start_file_processing(
                    StartFileProcessingRequest(file_id=second_zip.id, project_id=project_id)
                )

            await db_session.refresh(second_zip)
            assert second_zip.workflow_status == WorkflowStatusEnum.FAILED
        finally:
            if first_handle is not None:
                await first_handle.terminate()
            temporal_worker._client = previous_client
