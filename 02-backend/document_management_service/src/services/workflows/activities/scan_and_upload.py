import asyncio
from dataclasses import dataclass
from io import BytesIO
from uuid import UUID

from audit_client.workflow import audit_context_from_workflow
from temporalio import activity
from temporalio.exceptions import ApplicationError

from src.config.settings import settings
from src.models.db.database import AsyncSessionLocal
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import ErrorCode, WorkflowStatusEnum
from src.services.files.file_validation import validate_file_upload
from src.services.virus_scan import scan_bytes
from src.services.workflows.activities.activity_utils import (
    get_s3_context,
)
from src.utils.exceptions import (
    FileInvalidFileExtensionError,
    FileInvalidFileTypeError,
    VirusScanUnavailableError,
)
from src.utils.service_utils import (
    create_file_service,
    get_or_create_quarantine_storage_provider,
    get_or_create_storage_provider,
)


@dataclass
class ScanAndUploadInput:
    """Input for the scan_and_upload activity."""

    file_id: str
    bucket_path: str
    filename: str
    file_type: str = FileTypeEnum.DOCUMENT.value


@dataclass
class UpdateFileStatusInput:
    """Input for the update_file_workflow_status activity."""

    file_id: str
    status: str


async def _update_file_status(file_id: str, status: WorkflowStatusEnum) -> None:
    """Update workflow_status on a File record via FileService."""
    audit_context = audit_context_from_workflow(None, workflow_run_id=activity.info().workflow_run_id)
    async with AsyncSessionLocal() as db:
        service = await create_file_service(db=db)
        await service._update_file_workflow_status(
            file_id=UUID(file_id),
            status=status,
            audit_context=audit_context,
        )


@activity.defn
async def update_file_workflow_status(activity_input: UpdateFileStatusInput) -> None:
    """Activity wrapper for _update_file_status (used by workflow error handling)."""
    await _update_file_status(activity_input.file_id, WorkflowStatusEnum(activity_input.status))


@activity.defn
async def scan_and_upload(activity_input: ScanAndUploadInput) -> None:
    """Download a file from quarantine when ClamAV is enabled, otherwise from
    the clean bucket, then upload it to the clean bucket and update status.

    Sets workflow_status=COMPLETED on success, FAILED on virus detection.
    Scanner-unavailable errors are retryable — status stays RUNNING until resolved.
    """
    ctx = get_s3_context(activity_input.bucket_path)

    fs = ctx.fs
    source_s3_path = ctx.path

    def _read_file():
        with fs.open(source_s3_path, "rb") as f:
            return f.read()

    content = await asyncio.to_thread(_read_file)

    try:
        if activity_input.file_type == FileTypeEnum.ERWIDERUNGS_IMPORT.value:
            allowed_extensions = settings.ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS
            allowed_mime_types = settings.ERWIDERUNGS_ALLOWED_FILE_TYPES
        else:
            allowed_extensions = settings.PUBLIC_ALLOWED_FILE_EXTENSIONS
            allowed_mime_types = settings.PUBLIC_ALLOWED_FILE_TYPES

        validate_file_upload(
            filename=activity_input.filename,
            allowed_extensions=allowed_extensions,
            allowed_mime_types=allowed_mime_types,
            content_bytes=content,
        )
    except (FileInvalidFileExtensionError, FileInvalidFileTypeError) as exc:
        await _update_file_status(activity_input.file_id, WorkflowStatusEnum.FAILED)
        raise ApplicationError(
            str(exc),
            type=ErrorCode.UPLOAD_FAILED,
            non_retryable=True,
        ) from exc

    try:
        scan_result = await scan_bytes(content, settings.CLAMAV)
    except VirusScanUnavailableError as exc:
        raise ApplicationError(
            f"Virus scanner unavailable: {exc}",
            type=ErrorCode.UPLOAD_FAILED,
        ) from exc

    if not scan_result.is_clean:
        quarantine = await get_or_create_quarantine_storage_provider()
        await quarantine.delete_document(document_name=activity_input.bucket_path)
        await _update_file_status(activity_input.file_id, WorkflowStatusEnum.FAILED)
        raise ApplicationError(
            f"Virus detected: {scan_result.threat_name}",
            type=ErrorCode.VIRUS_DETECTED,
            non_retryable=True,
        )

    storage = await get_or_create_storage_provider()
    quarantine = await get_or_create_quarantine_storage_provider()
    same_bucket = storage.bucket_name == quarantine.bucket_name

    if not same_bucket:
        mime_type = await quarantine.get_file_mime_type(document_name=activity_input.bucket_path)
        await storage.upload_document_from_obj(
            document_name=activity_input.bucket_path,
            file_obj=BytesIO(content),
            overwrite=True,
            mime_type=mime_type,
        )

        await quarantine.delete_document(document_name=activity_input.bucket_path)

    await _update_file_status(activity_input.file_id, WorkflowStatusEnum.COMPLETED)

    activity.logger.info(
        f"Successfully scanned and uploaded file {activity_input.file_id} to clean bucket (same_bucket={same_bucket})."
    )
