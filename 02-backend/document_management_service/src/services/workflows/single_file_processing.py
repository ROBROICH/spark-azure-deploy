import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from src.models.db.workflow_enum import ErrorCode, WorkflowStatusEnum

with workflow.unsafe.imports_passed_through():
    from src.services.workflows.activities.scan_and_upload import (
        ScanAndUploadInput,
        UpdateFileStatusInput,
        scan_and_upload,
        update_file_workflow_status,
    )
    from src.services.workflows.workflow_models import SingleFileProcessingInput


@workflow.defn(name="SingleFileProcessingWorkflow")
class SingleFileProcessingWorkflow:
    """Workflow for processing a single uploaded file.

    Downloads from quarantine, scans for viruses, uploads to clean bucket,
    and updates the file status accordingly.

    The scan_and_upload activity handles COMPLETED and FAILED (virus) status
    internally. The workflow only needs to handle CANCELED and fallback FAILED
    (e.g. retries exhausted for scanner unavailability).
    """

    @workflow.run
    async def run(self, workflow_input: SingleFileProcessingInput) -> None:
        try:
            await workflow.execute_activity(
                scan_and_upload,
                ScanAndUploadInput(
                    file_id=workflow_input.file_id,
                    bucket_path=workflow_input.bucket_path,
                    filename=workflow_input.filename,
                    file_type=workflow_input.file_type,
                ),
                start_to_close_timeout=timedelta(minutes=15),
                retry_policy=RetryPolicy(
                    initial_interval=timedelta(seconds=5),
                    maximum_interval=timedelta(minutes=1),
                    maximum_attempts=5,
                    non_retryable_error_types=[ErrorCode.VIRUS_DETECTED],
                ),
            )
        except asyncio.CancelledError:
            await self._set_file_status(workflow_input.file_id, WorkflowStatusEnum.CANCELED)
            raise
        except Exception:
            # Virus detection: activity already set FAILED — this is idempotent.
            # Retries exhausted (scanner unavailable): sets FAILED here.
            await self._set_file_status(workflow_input.file_id, WorkflowStatusEnum.FAILED)
            raise

    async def _set_file_status(self, file_id: str, status: WorkflowStatusEnum) -> None:
        try:
            await workflow.execute_activity(
                update_file_workflow_status,
                UpdateFileStatusInput(file_id=file_id, status=status),
                start_to_close_timeout=timedelta(seconds=30),
            )
        except Exception as exc:
            workflow.logger.exception(f"Failed to update file status to {status}: {exc}")
