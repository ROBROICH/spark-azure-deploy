from datetime import timedelta
from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.common import RetryPolicy
from temporalio.workflow import ChildWorkflowHandle

from src.config.settings import settings
from src.models.schemas.files import FileObject
from src.models.schemas.temporal.diplan import (
    DiPlanDownloadWorkflowArgs,
    DiPlanFile,
    UploadFileToDMSActivityArgs,
)
from src.services.activities.diplan import download_diplan_file
from src.services.workflows.workflow_constants import DEFAULT_START_TO_CLOSE_TIMEOUT

DI_PLAN_DOWNLOAD_WORKFLOW_ID = WorkflowName("DiPlanDownloadWorkflow")
TASK_QUEUE = settings.temporal.task_queue


@workflow.defn(name=DI_PLAN_DOWNLOAD_WORKFLOW_ID)
class DiPlanDownloadWorkflow:
    @workflow.run
    async def run(self, args: DiPlanDownloadWorkflowArgs) -> list[FileObject]:
        file_objects = []
        for file in args.files:
            file_object = await workflow.execute_activity(
                download_diplan_file,
                UploadFileToDMSActivityArgs(
                    url=file.url,
                    project_id=args.project_id,
                    file_name=file.file_name,
                    folder_name=file.folder_name,
                    file_id=file.file_id,
                ),
                start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
                retry_policy=RetryPolicy(
                    maximum_attempts=5,
                    maximum_interval=timedelta(seconds=5),
                ),
            )
            if file_object:
                file_objects.append(file_object)
        return file_objects


async def execute_diplan_download(project_id: str, files: list[DiPlanFile]) -> list[FileObject]:
    return await execute_workflow(
        workflow_id=DI_PLAN_DOWNLOAD_WORKFLOW_ID,
        input=DiPlanDownloadWorkflowArgs(project_id=project_id, files=files),
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )


async def start_diplan_download(
    project_id: str, files: list[DiPlanFile]
) -> WorkflowHandle[Any, list[FileObject]] | ChildWorkflowHandle[Any, list[FileObject]]:
    return await start_workflow(
        workflow_id=DI_PLAN_DOWNLOAD_WORKFLOW_ID,
        input=DiPlanDownloadWorkflowArgs(project_id=project_id, files=files),
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
