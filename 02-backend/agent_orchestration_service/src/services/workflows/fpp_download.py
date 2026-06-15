from datetime import timedelta
from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.file_processing.file_processing import execute_fileprocessing_workflow
from temporal.workflows.file_processing.types import FileprocessingOutput, FileProcessingParams
from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.common import RetryPolicy
from temporalio.workflow import ChildWorkflowHandle

from src.config.settings import settings
from src.models.schemas.files import FileObject
from src.models.schemas.temporal.fpp import (
    FPPDownloadWorkflowArgs,
    FPPFile,
    UploadFPPFileToDMSActivityArgs,
)
from src.services.activities.fpp import download_fpp_file

FPP_DOWNLOAD_WORKFLOW_ID = WorkflowName("FPPDownloadWorkflow")
TASK_QUEUE = settings.temporal.task_queue


@workflow.defn(name=FPP_DOWNLOAD_WORKFLOW_ID)
class FPPDownloadWorkflow:
    """Workflow to download FPP Planunterlagen file and trigger file processing."""

    @workflow.run
    async def run(self, args: FPPDownloadWorkflowArgs) -> FileObject | None:
        """
        Download FPP file and optionally trigger file processing.

        Args:
            args: Workflow arguments containing project_id and file information

        Returns:
            FileObject if successful, None if file was skipped or failed
        """
        workflow.logger.info(
            f"Starting FPP download workflow for project {args.project_id}, file: {args.file.file_name}"
        )

        # Download the file
        file_object = await workflow.execute_activity(
            download_fpp_file,
            UploadFPPFileToDMSActivityArgs(
                url=args.file.url,
                project_id=args.project_id,
                file_name=args.file.file_name,
                file_id=args.file.file_id,
                file_type=args.file.file_type,
            ),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                maximum_attempts=5,
                maximum_interval=timedelta(seconds=5),
            ),
        )

        if not file_object:
            workflow.logger.info(f"File {args.file.file_name} was skipped or unsupported")
            return None

        workflow.logger.info(f"Successfully downloaded FPP file {args.file.file_name}, DMS file ID: {file_object.id}")

        # Check if file is a ZIP and trigger file processing workflow
        if file_object.filename.lower().endswith(".zip"):
            workflow.logger.info(
                f"Detected ZIP file: {file_object.filename} (ID: {file_object.id}), triggering file processing workflow"
            )

            file_processing_params = FileProcessingParams(
                file_id=str(file_object.id),
                filename=file_object.filename,
                project_id=args.project_id,
                file_type="zip",
                zip_path=str(file_object.bucket_path),
                entry_file_type="document",
            )

            workflow.logger.info(
                f"File processing parameters: file_id={file_object.id}, "
                f"filename={file_object.filename}, zip_path={file_object.bucket_path}"
            )

            try:
                workflow.logger.info(f"Starting file processing workflow for ZIP file {file_object.id}")

                file_processing_result: FileprocessingOutput = await execute_fileprocessing_workflow(
                    input=file_processing_params, project_id=args.project_id
                )

                workflow.logger.info(
                    f"Successfully completed file processing for ZIP file {file_object.id}. Result: {file_processing_result}"
                )

            except Exception as e:
                workflow.logger.error(
                    f"Failed to execute file processing workflow for ZIP file {file_object.id}: {type(e).__name__}: {e}"
                )
                # Re-raise to ensure workflow fails if file processing fails
                raise
        else:
            workflow.logger.info(f"File {file_object.filename} is not a ZIP file, skipping file processing")

        return file_object


async def execute_fpp_download(project_id: str, file: dict[str, Any]) -> FileObject | None:
    """
    Execute FPP download workflow synchronously.

    Args:
        project_id: Project ID
        file: File information dict with url, file_name, file_id, file_type

    Returns:
        FileObject if successful, None otherwise
    """
    return await execute_workflow(
        workflow_id=FPP_DOWNLOAD_WORKFLOW_ID,
        input=FPPDownloadWorkflowArgs(
            project_id=project_id,
            file=FPPFile(**file),
        ),
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )


async def start_fpp_download(
    project_id: str, file: dict[str, Any]
) -> WorkflowHandle[Any, FileObject | None] | ChildWorkflowHandle[Any, FileObject | None]:
    """
    Start FPP download workflow asynchronously.

    Args:
        project_id: Project ID
        file: File information dict with url, file_name, file_id, file_type

    Returns:
        Workflow handle
    """
    return await start_workflow(
        workflow_id=FPP_DOWNLOAD_WORKFLOW_ID,
        input=FPPDownloadWorkflowArgs(
            project_id=project_id,
            file=FPPFile(**file),
        ),
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
