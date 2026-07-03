import asyncio
from datetime import timedelta
from uuid import UUID

from temporal import execute_workflow
from temporal.workflows.orchestrator.ewms import (
    EWMSOrchestratorWorkflowInput,
    start_ewms_orchestrator_workflow,
)
from temporal.workflows.project_versioning.project_versioning import (
    CREATE_PROJECT_VERSION_WORKFLOW_ID,
)
from temporal.workflows.project_versioning.types import (
    CreateProjectVersionInput,
    CreateProjectVersionOutput,
    FileDiffSummary,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.config.settings import settings
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import (
    ActionEnum,
    ApprovalStatus,
    ErrorCode,
    WorkflowStatusEnum,
    ZipApprovalStatus,
)
from src.services.workflows.activities import validate_zip
from src.services.workflows.activities.activity_models import (
    DuplicateFile,
    PersistZipDiffInput,
    UpdateZipApprovalStatusInput,
    ValidateZipInput,
)
from src.services.workflows.activities.compute_diff import (
    ComputeDiffInput,
    FileChange,
    FileDiffResult,
    NewFile,
    RenameChange,
    create_diff,
)
from src.services.workflows.activities.extract_zip import (
    ExtractZipInput,
    extract_zip,
)
from src.services.workflows.activities.ingest_file import (
    IngestFileInput,
    SingleFileResult,
    ingest_file,
)
from src.services.workflows.activities.persist_zip_diff import (
    persist_zip_diff,
    update_zip_approval_status,
)
from src.services.workflows.activities.rename_file import RenameFileInput, rename_file
from src.services.workflows.activities.update_workflow_status import (
    UpdateFileStatusInput,
    update_file_status,
)
from src.services.workflows.workflow_models import (
    FileProcessingFailure,
    FileProcessingInput,
    FileProcessingOutput,
    FileProcessingSuccess,
    FileProcessingSummary,
)

ZIP_PROCESSING_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    maximum_interval=timedelta(minutes=1),
    maximum_attempts=50,
)


@workflow.defn(name="FileProcessingWorkflow")
class FileProcessingWorkflow:
    def __init__(self) -> None:
        self._diff_result: FileDiffResult | None = None

    @workflow.run
    async def run(self, workflow_input: FileProcessingInput) -> FileProcessingOutput:
        workflow.logger.info(
            f"FileProcessingWorkflow started for '{workflow_input.filename}' "
            f"(project={workflow_input.project_id}, type={workflow_input.file_type})"
        )

        await self._set_zip_status(
            zip_file_id=workflow_input.file_id,
            status=WorkflowStatusEnum.RUNNING,
        )

        try:
            extract_zip_results = await self._validate_and_extract_zip(workflow_input=workflow_input)

            failed_extraction_files = [file for file in extract_zip_results if not file.success]
            success_extraction_files = [file for file in extract_zip_results if file.success]
            workflow.logger.info(
                f"Extraction result: Failed: {len(failed_extraction_files)}, Success: {len(success_extraction_files)}"
            )

            self._diff_result = await self._calculate_diff(
                activity_input=success_extraction_files,
                workflow_input=workflow_input,
            )

            if self._requires_approval(workflow_input=workflow_input):
                await self._persist_diff(workflow_input=workflow_input)
                await self._set_zip_approval_status(
                    zip_file_id=workflow_input.file_id,
                    status=ZipApprovalStatus.REQUIRES_APPROVAL,
                )
                await self._set_zip_status(
                    zip_file_id=workflow_input.file_id,
                    status=WorkflowStatusEnum.COMPLETED,
                )
                return FileProcessingOutput(
                    successful=[],
                    failed=[],
                    summary=FileProcessingSummary(
                        total=0,
                        succeeded=0,
                        failed=0,
                    ),
                    status=ApprovalStatus.PENDING,
                )

            if self._should_create_project_version(workflow_input=workflow_input):
                await self._persist_diff(workflow_input=workflow_input)
                new_version = await self._create_project_version(workflow_input=workflow_input)
                successful = self._successful_results_from_committed_diff()
                failed = self._failed_results_from_activity_results(failed_extraction_files)
            else:
                new_version = workflow_input.source_project_version
                upload_results = await self._ingest_files(
                    ingest_input=self._diff_result.new + self._diff_result.changed,
                    workflow_input=workflow_input,
                    project_version=new_version,
                )

                rename_results = await self._rename_files(
                    rename_input=self._diff_result.renamed,
                    workflow_input=workflow_input,
                    project_version=new_version,
                )

                duplicate_results = self._handle_duplicates(
                    duplicate_input=self._diff_result.duplicate,
                )

                successful, failed = self._results_from_activity_results(
                    upload_results + rename_results + duplicate_results + failed_extraction_files
                )

            await self._start_ewms_workflow_if_needed(workflow_input, successful, new_version)

            await self._set_zip_status(
                zip_file_id=workflow_input.file_id,
                status=WorkflowStatusEnum.COMPLETED,
            )

            return FileProcessingOutput(
                successful=successful,
                failed=failed,
                summary=FileProcessingSummary(
                    total=len(successful) + len(failed),
                    succeeded=len(successful),
                    failed=len(failed),
                ),
                status=ApprovalStatus.APPROVED,
            )
        except asyncio.CancelledError:
            try:
                await self._set_zip_status(
                    zip_file_id=workflow_input.file_id,
                    status=WorkflowStatusEnum.CANCELED,
                )
            except Exception as exc:
                workflow.logger.exception(
                    f"Failed to update zip workflow status to 'CANCELED'. Exception raised: {exc}"
                )
            raise
        except Exception:
            try:
                await self._set_zip_status(
                    zip_file_id=workflow_input.file_id,
                    status=WorkflowStatusEnum.FAILED,
                )
            except Exception as exc:
                workflow.logger.exception(f"Failed to update zip workflow status to 'FAILED'. Exception raised: {exc}")
            raise

    async def _create_project_version(
        self,
        workflow_input: FileProcessingInput,
    ) -> int:
        diff = self._diff_result
        child_input = CreateProjectVersionInput(
            project_id=workflow_input.project_id,
            zip_file_id=workflow_input.file_id,
            file_diff=FileDiffSummary(
                deleted=[
                    {"file_id": item.file_id, "filename": item.filename} for item in (diff.deleted if diff else [])
                ],
                changed=[
                    {"file_id": item.file_id, "filename": item.filename} for item in (diff.changed if diff else [])
                ],
                renamed=[
                    {
                        "file_id": item.file_id,
                        "filename": item.new_name,
                        "old_name": item.old_name,
                        "new_name": item.new_name,
                    }
                    for item in (diff.renamed if diff else [])
                ],
            ),
        )
        result = await execute_workflow(
            workflow_id=CREATE_PROJECT_VERSION_WORKFLOW_ID,
            input=child_input,
            task_queue=settings.TEMPORAL.PLS_TASK_QUEUE,
            project_id=workflow_input.project_id,
            project_version=workflow_input.source_project_version,
        )
        output = CreateProjectVersionOutput.model_validate(result)
        if output.new_version is None:
            raise ValueError("CreateProjectVersionWorkflow completed without a new version")
        return output.new_version

    def _successful_results_from_committed_diff(self) -> list[FileProcessingSuccess]:
        if self._diff_result is None:
            return []

        successful: list[FileProcessingSuccess] = []
        successful.extend(
            FileProcessingSuccess(
                file_id=None,
                filename=item.filename,
                action=ActionEnum.INGEST,
            )
            for item in self._diff_result.new
        )
        successful.extend(
            FileProcessingSuccess(
                file_id=item.file_id,
                filename=item.filename,
                action=ActionEnum.INGEST,
            )
            for item in self._diff_result.changed
        )
        successful.extend(
            FileProcessingSuccess(
                file_id=item.file_id,
                filename=item.new_name,
                action=ActionEnum.RENAME,
            )
            for item in self._diff_result.renamed
        )
        return successful

    @staticmethod
    def _failed_results_from_activity_results(
        results: list[SingleFileResult],
    ) -> list[FileProcessingFailure]:
        return [
            FileProcessingFailure(
                filename=result.filename,
                action=result.action,
                error_code=result.error_code,
                error_message=result.error_message,
            )
            for result in results
            if not result.success
        ]

    def _results_from_activity_results(
        self,
        results: list[SingleFileResult],
    ) -> tuple[list[FileProcessingSuccess], list[FileProcessingFailure]]:
        successful = [
            FileProcessingSuccess(
                file_id=result.file_id,
                filename=result.filename,
                action=result.action,
            )
            for result in results
            if result.success
        ]
        return successful, self._failed_results_from_activity_results(results)

    def _ewms_file_ids_for_workflow_start(
        self,
        workflow_input: FileProcessingInput,
        successful: list[FileProcessingSuccess],
    ) -> list[UUID]:
        if workflow_input.file_type != FileTypeEnum.EWMS_ZIP.value:
            return []

        return [
            UUID(result.file_id)
            for result in successful
            if result.action == ActionEnum.INGEST and result.file_id is not None
        ]

    async def _start_ewms_workflow_if_needed(
        self,
        workflow_input: FileProcessingInput,
        successful: list[FileProcessingSuccess],
        project_version: int,
    ) -> None:
        file_ids = self._ewms_file_ids_for_workflow_start(workflow_input, successful)
        if not file_ids:
            return

        await start_ewms_orchestrator_workflow(
            EWMSOrchestratorWorkflowInput(
                project_id=UUID(workflow_input.project_id),
                file_ids=file_ids,
            ),
            project_id=workflow_input.project_id,
            project_version=project_version,
        )

    async def _set_zip_status(
        self,
        zip_file_id: str,
        status: WorkflowStatusEnum,
    ) -> None:
        await workflow.execute_activity(
            update_file_status,
            UpdateFileStatusInput(
                zip_file_id=zip_file_id,
                status=status,
            ),
            start_to_close_timeout=timedelta(seconds=30),
        )

    async def _set_zip_approval_status(
        self,
        zip_file_id: str,
        status: ZipApprovalStatus,
        error: str | None = None,
    ) -> None:
        await workflow.execute_activity(
            update_zip_approval_status,
            UpdateZipApprovalStatusInput(
                zip_file_id=zip_file_id,
                status=status,
                error=error,
            ),
            start_to_close_timeout=timedelta(seconds=30),
        )

    async def _persist_diff(self, workflow_input: FileProcessingInput) -> None:
        if self._diff_result is None:
            return
        await workflow.execute_activity(
            persist_zip_diff,
            PersistZipDiffInput(
                zip_file_id=workflow_input.file_id,
                source_project_version=workflow_input.source_project_version,
                diff=self._diff_result,
            ),
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=ZIP_PROCESSING_RETRY_POLICY,
        )

    async def _validate_and_extract_zip(
        self,
        workflow_input: FileProcessingInput,
    ) -> list[SingleFileResult]:
        if not workflow_input.zip_path:
            return [
                SingleFileResult(
                    success=False,
                    filename=workflow_input.filename,
                    error_code=ErrorCode.ZIP_NOT_FOUND,
                    error_message="Zip file not found in storage",
                    action=ActionEnum.UNZIP,
                )
            ]

        await workflow.execute_activity(
            validate_zip,
            ValidateZipInput(
                zip_path=workflow_input.zip_path,
                filename=workflow_input.filename,
            ),
            start_to_close_timeout=timedelta(seconds=30),
        )

        return await workflow.execute_activity(
            extract_zip,
            ExtractZipInput(
                zip_file_id=workflow_input.file_id,
                filename=workflow_input.filename,
                project_id=workflow_input.project_id,
                zip_path=workflow_input.zip_path,
                file_type=workflow_input.file_type,
            ),
            start_to_close_timeout=timedelta(minutes=20),
            retry_policy=ZIP_PROCESSING_RETRY_POLICY,
        )

    async def _calculate_diff(
        self,
        activity_input: list[SingleFileResult],
        workflow_input: FileProcessingInput,
    ) -> FileDiffResult:
        return await workflow.execute_activity(
            create_diff,
            ComputeDiffInput(
                project_id=workflow_input.project_id,
                zip_file_id=workflow_input.file_id,
                files=activity_input,
                project_version=workflow_input.source_project_version,
                entry_file_type=workflow_input.entry_file_type,
            ),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=ZIP_PROCESSING_RETRY_POLICY,
        )

    async def _ingest_files(
        self,
        ingest_input: list[FileChange | NewFile],
        workflow_input: FileProcessingInput,
        project_version: int,
    ) -> list[SingleFileResult]:
        results: list[SingleFileResult] = []
        for file in ingest_input:
            existing_file_id = file.file_id if isinstance(file, FileChange) else None
            file_result = await workflow.execute_activity(
                ingest_file,
                IngestFileInput(
                    project_id=workflow_input.project_id,
                    project_version=project_version,
                    zip_file_id=workflow_input.file_id,
                    filename=file.filename,
                    bucket_path=file.bucket_path,
                    entry_file_type=workflow_input.entry_file_type,
                    file_id=existing_file_id,
                ),
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=ZIP_PROCESSING_RETRY_POLICY,
            )
            results.append(file_result)
        return results

    def _handle_duplicates(
        self,
        duplicate_input: list[DuplicateFile],
    ) -> list[SingleFileResult]:
        """Helper method to handle duplicate files (EWMS-specific).

        Duplicates are files that have the same name as existing files.
        They are logged as failures and not uploaded.
        """
        results: list[SingleFileResult] = []
        for dup in duplicate_input:
            workflow.logger.warning(
                f"Duplicate EWMS document detected: '{dup.filename}') matches existing file ID {dup.existing_file_id}"
            )
            results.append(
                SingleFileResult(
                    success=False,
                    filename=dup.filename,
                    action=ActionEnum.UPLOAD,
                    file_id=None,
                    bucket_path=dup.bucket_path,
                    error_code=ErrorCode.DUPLICATE_FILE,
                    error_message=f"Duplicate file detected - matches existing file {dup.existing_file_id}",
                )
            )
        return results

    async def _rename_files(
        self,
        rename_input: list[RenameChange],
        workflow_input: FileProcessingInput,
        project_version: int,
    ) -> list[SingleFileResult]:
        results: list[SingleFileResult] = []
        for file in rename_input:
            file_result = await workflow.execute_activity(
                rename_file,
                RenameFileInput(
                    project_id=workflow_input.project_id,
                    project_version=project_version,
                    old_name=file.old_name,
                    new_name=file.new_name,
                    file_id=file.file_id,
                ),
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=ZIP_PROCESSING_RETRY_POLICY,
            )
            results.append(file_result)
        return results

    def _requires_approval(self, workflow_input: FileProcessingInput) -> bool:
        if not settings.TEMPORAL.ENABLE_APPROVAL:
            return False

        if workflow_input.file_type == "ewms_zip":
            return False

        if self._diff_result is None:
            return True

        return bool(
            self._diff_result.deleted
            or self._diff_result.changed
            or self._diff_result.renamed
            or self._diff_result.unchanged
        )

    def _should_create_project_version(self, workflow_input: FileProcessingInput) -> bool:
        if workflow_input.file_type == "ewms_zip":
            return False

        if self._diff_result is None:
            return False

        return bool(
            self._diff_result.new
            or self._diff_result.deleted
            or self._diff_result.changed
            or self._diff_result.renamed
            or self._diff_result.unchanged
        )
