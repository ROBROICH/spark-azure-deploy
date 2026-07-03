from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, cast
from uuid import UUID, uuid4

import httpx
from audit_client import ChangeType, record_audit_entry
from audit_client.workflow import workflow_actor_context_from_request_kwargs
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import status as http_status
from node_crud.exceptions import ProjectVersionLockedError
from sqlalchemy import and_, delete, not_, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.functions import func
from temporal import start_workflow
from temporalio.client import WorkflowHandle
from temporalio.common import (
    WorkflowIDConflictPolicy,
    WorkflowIDReusePolicy,
)
from temporalio.exceptions import WorkflowAlreadyStartedError

from src.config.settings import settings
from src.models.db.db_models import File, FileTopic, ZipFile
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipApprovalStatus
from src.models.schemas.file_schema import (
    FileUpdateRequest,
    ProjectDocumentUpload,
    StartFileProcessingRequest,
    StartFileProcessingResponse,
    TemporalCheckpointUpload,
    UploadRequest,
)
from src.services.files.file_validation import validate_file_upload
from src.services.files.path_builder.path_builder_base import FileContext
from src.services.files.path_builder.path_builder_factory import PathBuilderFactory
from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)
from src.utils.exceptions import (
    WorkflowInPendingStateError,
    WorkflowInRunningStateError,
    WorkflowRequiresApprovalError,
)
from src.utils.logger import logger

INTERNAL_FILE_TYPES: tuple[FileTypeEnum, ...] = (
    FileTypeEnum.TEMPORAL_CHECKPOINT,
    FileTypeEnum.CONTENT_EXTRACTION,
    FileTypeEnum.LAW_DATA,
    FileTypeEnum.REDACTED_DOCUMENT,
    FileTypeEnum.ERWIDERUNGS_EXPORT,
)
UPSTREAM_BODY_LOG_LIMIT = 2_000


def _project_version_conflict_message(correlation_id: str) -> str:
    return (
        "Project version cannot be modified while version creation is locked. "
        f"Retry after the current version operation completes. correlation_id={correlation_id}"
    )


class FileService:
    """Service class for managing files and database records."""

    def __init__(
        self,
        db: AsyncSession,
        storage_provider_service: BaseStorageProviderService,
        quarantine_storage_provider_service: BaseStorageProviderService | None = None,
    ) -> None:
        """
        Args:
            db: Async SQLAlchemy session.
            storage_provider_service: BaseStorageProviderService
                instance (for mocking/testing).
            quarantine_storage_provider_service: Storage provider for quarantine bucket.
                Falls back to storage_provider_service if not provided.
        """
        self.db = db
        self.storage_provider_service = storage_provider_service
        self.quarantine_storage_provider_service = quarantine_storage_provider_service or storage_provider_service

    @staticmethod
    def _get_object_path(
        filename: str,
        context: UploadRequest,
        version: int,
    ) -> str:
        """
        Create the object path from filename and context.

        Args:
            filename (str): The name of the file.
            context (UploadRequest): The context of the file,
                containing additional path information.
            version (int): The version number to use in the path.

        Returns:
            str: The object path with cleaned filename.
        """
        return str(
            PathBuilderFactory.build_path(
                filename=filename,
                context=FileContext(**context.model_dump(), version=version),
            )
        )

    async def _get_latest_version(
        self,
        file_data: UploadRequest,
        project_version: int | None = None,
    ) -> tuple[File | None, int]:
        """
        Retrieve the latest non-deleted version of a file by filename and
        optional project scope.

        Args:
            file_data (UploadRequest): The pydatic model of the
                uploaded file.

        Returns:
            The latest non-deleted File record and the next upload version.
        """
        # Build the base conditions for filename and project scoping
        file_dump = file_data.model_dump(by_alias=False)

        optional_fields = {
            "project_id": File.project_id,
            "workflow_id": File.workflow_id,
            "run_id": File.run_id,
        }
        conditions = [
            File.filename == file_data.filename,
            File.type == file_data.type,
        ]
        if project_version is not None:
            conditions.append(File.project_version == project_version)
        for key, col in optional_fields.items():
            if key in file_dump and file_dump[key] is not None:
                conditions.append(col == file_dump[key])
            elif key in file_dump:
                conditions.append(col.is_(None))

        # Get the highest version number that matches the criteria
        max_version_result = await self.db.execute(select(func.max(File.version)).where(and_(*conditions)))
        max_version: int | None = max_version_result.scalar_one_or_none()

        next_version = (max_version or 0) + 1

        # Fetch the latest non-deleted record (if any) for returning the File object
        latest_file_result = await self.db.execute(
            select(File)
            .where(and_(*conditions, File.is_deleted.is_(False)))
            .order_by(File.version.desc())
            .limit(1)
            .options(selectinload(File.topics))
        )
        latest_file: File | None = latest_file_result.scalar_one_or_none()

        return latest_file, next_version

    async def _get_latest_project_version(self, project_id: UUID) -> int:
        url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/latest-version"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            body = response.json()
        latest_version = body.get("latest_version", body.get("latestVersion"))
        if latest_version is None:
            raise KeyError("latest_version")
        return int(latest_version)

    async def _validate_project_write_version(self, project_id: UUID, project_version: int) -> int:
        url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/version-lock/validate-write"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"project_version": project_version})
            if response.status_code == http_status.HTTP_409_CONFLICT:
                correlation_id = str(uuid4())
                logger.warn(
                    action=EventAction.VALIDATE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    project_id=str(project_id),
                    message=(
                        "Project write-version validation rejected by upstream "
                        f"(status={response.status_code}, correlation_id={correlation_id}, "
                        f"body={response.text[:UPSTREAM_BODY_LOG_LIMIT]!r})"
                    ),
                )
                raise ProjectVersionLockedError(str(project_id), _project_version_conflict_message(correlation_id))
            response.raise_for_status()
            body = response.json()
        latest_version = body.get("latest_version", body.get("latestVersion"))
        if latest_version is None:
            raise KeyError("latest_version")
        return int(latest_version)

    async def _resolve_upload_project_version(
        self,
        file_data: UploadRequest,
        project_version: int | None,
    ) -> int | None:
        project_id = getattr(file_data, "project_id", None)
        if project_id is None:
            return project_version

        resolved_version = project_version
        if resolved_version is None:
            resolved_version = await self._get_latest_project_version(project_id)
        return await self._validate_project_write_version(project_id, resolved_version)

    @staticmethod
    async def _build_file_record(
        file_data: UploadRequest,
        bucket_path: str,
        version: int,
        mime_type: str | None = None,
        source_zip_file_id: UUID | None = None,
        project_version: int | None = None,
    ) -> File | ZipFile:
        """
        Maps any UploadRequest to a Files DB model.

        Args:
            file_data (UploadRequest): The Pydantic model of the
                uploaded file.
            bucket_path: The path of the file in the bucket.
            version (int): The version number of the file.
            mime_type (str | None): The MIME type of the file.
            source_zip_file_id (UUID | None): The ID of the source zip file.

        Returns:
            File | ZipFile: The database file or zip file record.
        """
        if file_data.type in (FileTypeEnum.ZIP, FileTypeEnum.EWMS_ZIP):
            zip_file = ZipFile()

            zip_file.type = FileTypeEnum(file_data.type)
            zip_file.filename = file_data.filename
            zip_file.bucket_path = bucket_path
            zip_file.project_id = file_data.project_id
            zip_file.workflow_status = WorkflowStatusEnum.PENDING

            if project_version is not None:
                zip_file.project_version = project_version
            return zip_file

        workflow_id = file_data.workflow_id if isinstance(file_data, TemporalCheckpointUpload) else None
        run_id = file_data.run_id if isinstance(file_data, TemporalCheckpointUpload) else None

        file = File()

        file.type = FileTypeEnum(file_data.type)
        file.filename = file_data.filename
        file.mime_type = mime_type
        file.bucket_path = bucket_path
        file.version = version
        file.project_id = file_data.project_id
        file.run_id = run_id
        file.workflow_id = workflow_id
        file.source_zip_file_id = source_zip_file_id

        if project_version is not None:
            file.project_version = project_version
            file.added_in_version = project_version
        return file

    async def _prepare_version_and_check_conflict(
        self,
        file_data: UploadRequest,
        project_version: int | None = None,
    ) -> tuple[File | None, int]:
        """Determine the next version number and check for filename conflicts.

        Retrieves the latest non-deleted file record (if any) for the given filename
        and project scope, then computes the next version number.

        If a file already exists and `create_new_version` is False, raises an error
        to prevent overwriting/duplication.

        Args:
            file_data (UploadRequest): The Pydantic model of the
                uploaded file.

        Returns:
            A tuple containing:
            - The latest non-deleted File record (or None if no existing file)
            - The next version number to use (1 if none exist, otherwise max+1)

        Raises:
            FileExistsError: If a file already exists and create_new_version is False.
        """
        file_type = FileTypeEnum(file_data.type)
        if file_type in (FileTypeEnum.ZIP, FileTypeEnum.EWMS_ZIP):
            conditions = [
                ZipFile.filename == file_data.filename,
                ZipFile.type == file_type,
                ZipFile.project_id == file_data.project_id,
            ]
            if project_version is not None:
                conditions.append(ZipFile.project_version == project_version)
            zip_count_result = await self.db.execute(select(func.count(ZipFile.id)).where(and_(*conditions)))
            zip_count: int = zip_count_result.scalar_one()
            return None, zip_count + 1

        existing_file, next_version = await self._get_latest_version(
            file_data=file_data,
            project_version=project_version,
        )

        if existing_file is not None and not file_data.create_new_version:
            raise FileExistsError(
                f"File '{file_data.filename}' already exists "
                f"(latest version {existing_file.version}). "
                f"Pass create_new_version=True to create a new version instead."
            )

        return existing_file, next_version

    @staticmethod
    async def _mark_previous_as_deleted(
        existing_file: File | None,
        next_version: int,
    ) -> None:
        """Soft-delete the previous version of a file if it exists.

        Marks the existing file record as deleted (is_deleted=True) and logs the action.

        Args:
            existing_file: The previous non-deleted File record (or None).
            next_version: The version number of the new file being created.
        """
        if not existing_file:
            return

        existing_file.is_deleted = True
        logger.info(
            action=EventAction.UPLOAD,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            default_event=LogEventDefault.DOCUMENT_UPLOAD,
            file_id=str(existing_file.id),
            file_path=existing_file.bucket_path,
            message=(f"Marked previous file (v{existing_file.version}) as deleted for new version {next_version}"),
        )

    async def _create_and_commit_file_record(
        self,
        file_data: UploadRequest,
        bucket_path: str,
        mime_type: str,
        version: int,
        source_zip_file_id: UUID | None = None,
        file_size: int | None = None,
        project_version: int | None = None,
        storage_provider: BaseStorageProviderService | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> File | ZipFile:
        """Create, persist, and refresh a new File (or ZipFile) record in the database.

        Builds the record using _build_file_record, adds it to the session,
        commits the transaction, and refreshes the object.

        On any exception:
        - Rolls back the transaction
        - Attempts to delete the uploaded object from storage
        - Re-raises the original exception

        Args:
            file_data: Validated upload request data.
            bucket_path: Full relative path where the file was/will be stored.
            mime_type: MIME type of the uploaded file.
            version: Version number assigned to this file record.
            source_zip_file_id: Optional ID of the source ZIP file this file came from.
            file_size: Optional file size in bytes for structured logging.
            storage_provider: Storage provider to use for cleanup on failure.
                Defaults to self.storage_provider_service.

        Returns:
            The newly created and refreshed File or ZipFile database object.

        Raises:
            Exception: Any database or unexpected error during commit (after cleanup).
        """
        cleanup_storage = storage_provider or self.storage_provider_service
        file_record = await self._build_file_record(
            file_data=file_data,
            bucket_path=bucket_path,
            mime_type=mime_type,
            version=version,
            source_zip_file_id=source_zip_file_id,
            project_version=project_version,
        )

        try:
            self.db.add(file_record)
            await self.db.flush()
            if audit_context is not None and file_record.project_id is not None:
                await record_audit_entry(
                    self.db,
                    project_id=file_record.project_id,
                    entity_type="zip_file" if isinstance(file_record, ZipFile) else "file",
                    change_type=ChangeType.CREATE,
                    entity_id=file_record.id,
                    **audit_context,
                )
            await self.db.commit()
            if isinstance(file_record, File):
                await self.db.refresh(file_record, attribute_names=["topics"])
            else:
                await self.db.refresh(file_record)
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                file_id=str(file_record.id),
                file_path=bucket_path,
                file_name=file_data.filename,
                file_size=file_size,
                message="Successfully created new file record.",
            )
            return file_record
        except Exception as exc:
            await self.db.rollback()
            try:
                await cleanup_storage.delete_document(document_name=bucket_path)
                logger.warn(
                    action=EventAction.DELETE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    file_path=bucket_path,
                    message="Cleaned up failed upload object.",
                )
            except Exception as e:
                logger.error(
                    action=EventAction.DELETE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    file_path=bucket_path,
                    message=f"Cleanup failed after rollback: {e}",
                )
            raise exc

    async def confirm_upload(
        self,
        file_data: UploadRequest,
        project_version: int | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> File | ZipFile:
        """Confirm a file was uploaded via signed URL and create its metadata record.

        Verifies the file exists in storage bucket (quarantine for
        user uploads, clean bucket for internal types like TEMPORAL_CHECKPOINT),
        checks for existing versions, soft-deletes any previous version if applicable,
        and creates the new record.

        If a file with the same name already exists and create_new_version is False,
        raises FileExistsError.

        Args:
            file_data: Upload request metadata (filename, type, etc.) for a
                pre-uploaded file.

        Returns:
            The newly created File or ZipFile database object.

        Raises:
            FileNotFoundError: If the file does not exist in storage at
                the expected path.
            FileExistsError: If file exists and create_new_version=False.
            ValueError: If MIME type cannot be determined.
            Exception: Any database error (with cleanup on failure).
        """
        project_version = await self._resolve_upload_project_version(
            file_data=file_data,
            project_version=project_version,
        )
        existing_file, version = await self._prepare_version_and_check_conflict(
            file_data=file_data,
            project_version=project_version,
        )

        bucket_path = self._get_object_path(
            filename=file_data.filename,
            context=file_data,
            version=version,
        )

        # Internal types go directly to clean bucket (no quarantine)
        storage = self._get_storage_for_type(file_data.type)

        if not await storage.document_exists(document_name=bucket_path):
            raise FileNotFoundError(f"Uploaded file not found in storage: {bucket_path}")

        mime_type = await storage.get_file_mime_type(document_name=bucket_path)

        await self._mark_previous_as_deleted(
            existing_file=existing_file,
            next_version=version,
        )

        record = await self._create_and_commit_file_record(
            file_data=file_data,
            bucket_path=bucket_path,
            mime_type=mime_type,
            version=version,
            project_version=project_version,
            storage_provider=storage,
            audit_context=audit_context,
        )

        # Set workflow_status=PENDING for user-uploaded single files (only when scanning enabled)
        if isinstance(record, File) and settings.CLAMAV.ENABLED and storage is self.quarantine_storage_provider_service:
            record.workflow_status = WorkflowStatusEnum.PENDING
            await self.db.commit()
            await self.db.refresh(record)

        return record

    def _get_storage_for_type(self, file_type: FileTypeEnum) -> "BaseStorageProviderService":
        """Return the appropriate storage provider based on file type.

        When ClamAV is disabled, all types go to the clean bucket (feature off).
        Internal types (e.g. TEMPORAL_CHECKPOINT) always go to the clean bucket
        because they are uploaded by the system, not by users.
        User-uploaded types go to quarantine for virus scanning.
        """
        if not settings.CLAMAV.ENABLED:
            return self.storage_provider_service
        if file_type in INTERNAL_FILE_TYPES:
            return self.storage_provider_service
        return self.quarantine_storage_provider_service

    async def _get_reserved_zip_entry_file(
        self,
        *,
        project_id: UUID,
        project_version: int,
        filename: str,
        source_zip_file_id: UUID | None,
        file_type: FileTypeEnum = FileTypeEnum.DOCUMENT,
    ) -> File | None:
        """Return already reserved/finalized file row for one ZIP entry, if present."""
        result = await self.db.execute(
            select(File)
            .where(
                File.project_id == project_id,
                File.project_version == project_version,
                File.type == file_type,
                File.filename == filename,
                File.source_zip_file_id == source_zip_file_id,
            )
            .order_by(File.version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _reserve_zip_entry_version(
        self,
        *,
        project_id: UUID,
        project_version: int,
        filename: str,
        source_zip_file_id: UUID | None,
        mime_type: str,
        file_type: FileTypeEnum = FileTypeEnum.DOCUMENT,
        commit: bool = True,
        audit_context: dict[str, Any] | None = None,
    ) -> File:
        """Create (or re-use on race) a deterministic reservation row for ZIP entry."""
        from src.models.schemas.file_schema import EwmsDocumentUpload

        if file_type == FileTypeEnum.EWMS_DOCUMENT:
            upload_ctx = EwmsDocumentUpload(
                type=FileTypeEnum.EWMS_DOCUMENT,
                project_id=project_id,
                filename=filename,
                create_new_version=True,
            )
        else:
            upload_ctx = ProjectDocumentUpload(
                type=FileTypeEnum.DOCUMENT,
                project_id=project_id,
                filename=filename,
                create_new_version=True,
            )
        _existing_latest, next_version = await self._get_latest_version(
            upload_ctx,
            project_version=project_version,
        )
        bucket_path = self._get_object_path(
            filename=filename,
            context=upload_ctx,
            version=next_version,
        )

        reservation = File()

        reservation.type = file_type
        reservation.filename = filename
        reservation.mime_type = mime_type
        reservation.bucket_path = bucket_path
        reservation.version = next_version
        reservation.project_id = project_id
        reservation.project_version = project_version
        reservation.source_zip_file_id = source_zip_file_id
        reservation.added_in_version = project_version
        reservation.is_deleted = True

        try:
            self.db.add(reservation)
            if audit_context is not None and reservation.project_id is not None:
                await record_audit_entry(
                    self.db,
                    project_id=reservation.project_id,
                    entity_type="file",
                    change_type=ChangeType.CREATE,
                    entity_id=reservation.id,
                    **audit_context,
                )
            if commit:
                await self.db.commit()
                await self.db.refresh(reservation)
            else:
                await self.db.flush()
            return reservation
        except IntegrityError:
            if not commit:
                raise
            await self.db.rollback()
            existing = await self._get_reserved_zip_entry_file(
                project_id=project_id,
                project_version=project_version,
                filename=filename,
                source_zip_file_id=source_zip_file_id,
                file_type=file_type,
            )
            if existing is None:
                raise
            return existing

    async def ingest_zip_entry_document(
        self,
        *,
        source_zip_file_id: UUID | None,
        project_id: UUID,
        project_version: int,
        filename: str,
        bucket_path: str,
        file_type: FileTypeEnum = FileTypeEnum.DOCUMENT,
        commit: bool = True,
        audit_context: dict[str, Any] | None = None,
    ) -> File:
        """Idempotently ingest one document entry from a ZIP file."""
        reserved = await self._get_reserved_zip_entry_file(
            project_id=project_id,
            project_version=project_version,
            filename=filename,
            source_zip_file_id=source_zip_file_id,
            file_type=file_type,
        )
        mime_type = await self.storage_provider_service.get_file_mime_type(document_name=bucket_path)

        if reserved is None:
            reserved = await self._reserve_zip_entry_version(
                project_id=project_id,
                project_version=project_version,
                filename=filename,
                source_zip_file_id=source_zip_file_id,
                mime_type=mime_type,
                file_type=file_type,
                commit=commit,
                audit_context=audit_context,
            )
        elif reserved.mime_type != mime_type:
            reserved.mime_type = mime_type
            if audit_context is not None and reserved.project_id is not None:
                await record_audit_entry(
                    self.db,
                    project_id=reserved.project_id,
                    entity_type="file",
                    change_type=ChangeType.UPDATE,
                    entity_id=reserved.id,
                    **audit_context,
                )
            if commit:
                await self.db.commit()
                await self.db.refresh(reserved)
            else:
                await self.db.flush()

        if not await self.storage_provider_service.document_exists(document_name=reserved.bucket_path):
            await self.storage_provider_service.copy_document(
                source_name=bucket_path,
                destination_name=reserved.bucket_path,
            )
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                file_id=str(reserved.id),
                file_path=bucket_path,
                file_name=reserved.filename,
                message=(f"Successfully copied file {reserved.filename} from ZIP file {source_zip_file_id}."),
            )
        else:
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                file_id=str(reserved.id),
                file_path=bucket_path,
                file_name=reserved.filename,
                message=(
                    f"File {reserved.filename} from ZIP file {source_zip_file_id} already exists. Skipping upload."
                ),
            )

        if reserved.is_deleted:
            if file_type != FileTypeEnum.EWMS_DOCUMENT:
                await self.db.execute(
                    update(File)
                    .where(
                        File.project_id == project_id,
                        File.project_version == project_version,
                        File.type == file_type,
                        File.filename == filename,
                        File.is_deleted.is_(False),
                        File.id != reserved.id,
                    )
                    .values(is_deleted=True)
                )
            reserved.is_deleted = False
            if audit_context is not None and reserved.project_id is not None:
                await record_audit_entry(
                    self.db,
                    project_id=reserved.project_id,
                    entity_type="file",
                    change_type=ChangeType.UPDATE,
                    entity_id=reserved.id,
                    **audit_context,
                )
            if commit:
                await self.db.commit()
                await self.db.refresh(reserved)
            else:
                await self.db.flush()

        return reserved

    async def get_file(
        self,
        file_id: UUID,
        include_deleted: bool = False,
        project_version: int | None = None,
    ) -> File | None:
        """
        Retrieve a file by its UUID.

        Args:
            file_id (UUID): The unique ID of the file.
            include_deleted (bool): If True, include soft-deleted files.
            project_version (int | None): If provided, scope the lookup to
                a single ``(id, project_version)`` row. With composite PKs the
                same id can exist in multiple versions, so callers operating
                on a specific version should pass this.

        Returns:
            File | None: The File DB object if found, otherwise None.
        """
        conditions = [File.id == file_id]
        if project_version is not None:
            conditions.append(File.project_version == project_version)
        else:
            latest_known = (
                await self.db.execute(
                    select(File.project_id, File.project_version)
                    .where(File.id == file_id)
                    .order_by(File.project_version.desc(), File.version.desc())
                    .limit(1)
                )
            ).one_or_none()
            if latest_known is None:
                return None
            if latest_known.project_id is not None:
                conditions.append(
                    File.project_version == await self._get_latest_project_version(latest_known.project_id)
                )
            else:
                conditions.append(File.project_version == latest_known.project_version)

        if not include_deleted:
            conditions.append(not_(File.is_deleted))

        query = select(File).where(and_(*conditions)).options(selectinload(File.topics))
        result = await self.db.execute(query)

        return result.scalar_one_or_none()

    async def replace_zip_entry_document_content(
        self,
        *,
        file_id: UUID,
        project_id: UUID,
        project_version: int,
        new_source_zip_file_id: UUID | None,
        new_filename: str,
        new_bucket_source_path: str,
        file_type: FileTypeEnum = FileTypeEnum.DOCUMENT,
        commit: bool = True,
        previous_bucket_path: str | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> File:
        """Refresh a changed ZIP entry on the copied target-version File row."""
        existing = await self.get_file(
            file_id=file_id,
            include_deleted=True,
            project_version=project_version,
        )
        if existing is None:
            raise FileNotFoundError(f"File {file_id} at project_version {project_version} not found")
        if (
            existing.source_zip_file_id == new_source_zip_file_id
            and existing.filename == new_filename
            and not existing.is_deleted
            and (previous_bucket_path is None or existing.bucket_path != previous_bucket_path)
        ):
            return existing

        upload_ctx = ProjectDocumentUpload(
            type=file_type,
            project_id=project_id,
            filename=new_filename,
            create_new_version=True,
        )
        _existing_latest, next_version = await self._get_latest_version(
            upload_ctx,
            project_version=project_version,
        )
        new_bucket_path = self._get_object_path(
            filename=new_filename,
            context=upload_ctx,
            version=next_version,
        )

        new_mime_type = await self.storage_provider_service.get_file_mime_type(
            document_name=new_bucket_source_path,
        )
        if not await self.storage_provider_service.document_exists(document_name=new_bucket_path):
            await self.storage_provider_service.copy_document(
                source_name=new_bucket_source_path,
                destination_name=new_bucket_path,
            )

        existing.filename = new_filename
        existing.bucket_path = new_bucket_path
        existing.mime_type = new_mime_type
        existing.source_zip_file_id = new_source_zip_file_id
        existing.version = next_version
        existing.is_deleted = False
        existing.is_outdated = False
        if audit_context is not None and existing.project_id is not None:
            await record_audit_entry(
                self.db,
                project_id=existing.project_id,
                entity_type="file",
                change_type=ChangeType.UPDATE,
                entity_id=existing.id,
                **audit_context,
            )
        if commit:
            await self.db.commit()
            await self.db.refresh(existing)
        else:
            await self.db.flush()
        return existing

    @staticmethod
    def _clone_file_topic(
        topic: FileTopic,
        *,
        target_version: int,
    ) -> FileTopic:
        cloned = FileTopic()

        cloned.id = topic.id
        cloned.file_id = topic.file_id
        cloned.topic_id = topic.topic_id
        cloned.project_id = topic.project_id
        cloned.project_version = target_version
        cloned.is_deleted = topic.is_deleted
        cloned.frontend_parent_ids = list(topic.frontend_parent_ids or [])
        cloned.update_type = topic.update_type

        return cloned

    async def _copy_missing_file_topics_to_project_version(
        self,
        *,
        source: File,
        target_version: int,
    ) -> bool:
        source_topics = [topic for topic in source.topics if not topic.is_deleted]
        if not source_topics:
            return False

        existing_topic_ids = set(
            (
                await self.db.execute(
                    select(FileTopic.topic_id).where(
                        FileTopic.file_id == source.id,
                        FileTopic.project_version == target_version,
                    )
                )
            )
            .scalars()
            .all()
        )
        copied_topics = [
            self._clone_file_topic(topic, target_version=target_version)
            for topic in source_topics
            if topic.topic_id not in existing_topic_ids
        ]
        if not copied_topics:
            return False

        self.db.add_all(copied_topics)
        return True

    async def _copy_file_to_project_version(
        self,
        *,
        file_id: UUID,
        source_version: int,
        target_version: int,
        filename: str | None = None,
        is_outdated: bool = False,
    ) -> File:
        """Copy one source-version File row into a target project version if needed."""
        existing_target = await self.get_file(
            file_id=file_id,
            include_deleted=True,
            project_version=target_version,
        )
        if existing_target is not None:
            source = await self.get_file(
                file_id=file_id,
                include_deleted=True,
                project_version=source_version,
            )
            if source is not None and await self._copy_missing_file_topics_to_project_version(
                source=source,
                target_version=target_version,
            ):
                await self.db.flush()
            return existing_target

        source = await self.get_file(
            file_id=file_id,
            include_deleted=True,
            project_version=source_version,
        )
        if source is None:
            raise FileNotFoundError(f"File {file_id} at project_version {source_version} not found")

        target = File()

        target.id = source.id
        target.type = source.type
        target.filename = filename or source.filename
        target.mime_type = source.mime_type
        target.version = source.version
        target.bucket_path = source.bucket_path
        target.project_id = source.project_id
        target.project_version = target_version
        target.workflow_id = source.workflow_id
        target.run_id = source.run_id
        target.vector_searchable = source.vector_searchable
        target.source_zip_file_id = None
        target.workflow_status = source.workflow_status
        target.added_in_version = source.added_in_version
        target.is_outdated = is_outdated
        target.is_deleted = source.is_deleted
        target.frontend_parent_ids = list(source.frontend_parent_ids or [])
        target.update_type = source.update_type

        target.topics = [
            self._clone_file_topic(topic, target_version=target_version)
            for topic in source.topics
            if not topic.is_deleted
        ]
        self.db.add(target)
        await self.db.flush()
        return target

    @staticmethod
    def _processed_json_filename_for(document_filename: str) -> str:
        """Derive the conventional ``_processed.json`` filename for a DOCUMENT."""
        stem = document_filename.rsplit(".", 1)[0]
        leaf = stem.rsplit("/", 1)[-1]
        return f"{stem}/{leaf}_processed.json"

    async def _carry_renamed_processed_json(
        self,
        *,
        project_id: UUID,
        source_version: int,
        target_version: int,
        old_document_name: str,
        new_document_name: str,
    ) -> None:
        """Carry forward a renamed document's ``_processed.json`` artefact.

        The artefact is copied to ``target_version`` with the filename derived
        from ``new_document_name``, so downstream consumers (formale-pruefung,
        plausi) that reconstruct the artefact path from the current DOCUMENT
        filename still find it. No-op if no artefact exists for the old name.
        """
        old_processed_filename = self._processed_json_filename_for(old_document_name)
        new_processed_filename = self._processed_json_filename_for(new_document_name)
        processed_file_id = (
            await self.db.execute(
                select(File.id).where(
                    File.project_id == project_id,
                    File.project_version == source_version,
                    File.type == FileTypeEnum.CONTENT_EXTRACTION,
                    File.filename == old_processed_filename,
                    File.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if processed_file_id is None:
            return
        copied = await self._copy_file_to_project_version(
            file_id=processed_file_id,
            source_version=source_version,
            target_version=target_version,
            filename=new_processed_filename,
        )
        copied.filename = new_processed_filename

    async def _load_and_validate_zip_diff_source(
        self,
        *,
        zip_file_id: UUID,
        project_id: UUID,
        source_version: int,
    ) -> ZipFile:
        """Load the ZIP row for a diff commit and validate request consistency."""
        zip_file_result = await self.db.execute(
            select(ZipFile).where(
                ZipFile.id == zip_file_id,
                ZipFile.project_version == source_version,
            )
        )
        zip_file = zip_file_result.scalar_one_or_none()
        if zip_file is None:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' at project_version {source_version} not found.")
        if zip_file.project_id != project_id:
            raise ValueError("ZIP project_id does not match request project_id")
        if zip_file.source_project_version != source_version:
            raise ValueError("ZIP diff source version does not match request source_version")
        return zip_file

    async def _copy_file_ids_to_target_version(
        self,
        *,
        file_ids: Sequence[UUID],
        source_version: int,
        target_version: int,
    ) -> None:
        """Copy each File row (by id) from the source into the target project version."""
        for file_id in file_ids:
            await self._copy_file_to_project_version(
                file_id=file_id,
                source_version=source_version,
                target_version=target_version,
            )

    async def _select_file_ids(
        self,
        *,
        project_id: UUID,
        source_version: int,
        file_type: FileTypeEnum,
        filename: str | None = None,
        filenames: Sequence[str] | None = None,
    ) -> Sequence[UUID]:
        """Select non-deleted File ids matching the given type/filename scope."""
        conditions = [
            File.project_id == project_id,
            File.project_version == source_version,
            File.type == file_type,
            File.is_deleted.is_(False),
        ]
        if filename is not None:
            conditions.append(File.filename == filename)
        if filenames is not None:
            conditions.append(File.filename.in_(filenames))
        result = await self.db.execute(select(File.id).where(*conditions))
        return result.scalars().all()

    async def _commit_unchanged_entries(
        self,
        *,
        project_id: UUID,
        source_version: int,
        target_version: int,
        unchanged: Sequence[Any],
    ) -> None:
        """Carry forward summary, EWMS docs, unchanged entries and their processed artefacts."""
        summary_file_ids = await self._select_file_ids(
            project_id=project_id,
            source_version=source_version,
            file_type=FileTypeEnum.CONTENT_EXTRACTION,
            filename="summary.json",
        )
        await self._copy_file_ids_to_target_version(
            file_ids=summary_file_ids,
            source_version=source_version,
            target_version=target_version,
        )

        ewms_file_ids = await self._select_file_ids(
            project_id=project_id,
            source_version=source_version,
            file_type=FileTypeEnum.EWMS_DOCUMENT,
        )
        await self._copy_file_ids_to_target_version(
            file_ids=ewms_file_ids,
            source_version=source_version,
            target_version=target_version,
        )

        await self._copy_file_ids_to_target_version(
            file_ids=[entry.file_id for entry in unchanged],
            source_version=source_version,
            target_version=target_version,
        )

        # Carry forward per-document content_extraction (_processed.json) artefacts for
        # unchanged documents. Without this, follow-up workflows (e.g. formale-pruefung's
        # InhaltsverzeichnisFinder) would see an empty list at target_version because
        # incremental re-extraction only runs for new/changed documents and would not
        # produce _processed.json for unchanged ones.
        expected_processed_filenames = [self._processed_json_filename_for(entry.filename) for entry in unchanged]
        if not expected_processed_filenames:
            return
        processed_file_ids = await self._select_file_ids(
            project_id=project_id,
            source_version=source_version,
            file_type=FileTypeEnum.CONTENT_EXTRACTION,
            filenames=expected_processed_filenames,
        )
        await self._copy_file_ids_to_target_version(
            file_ids=processed_file_ids,
            source_version=source_version,
            target_version=target_version,
        )

    async def _commit_deleted_entries(
        self,
        *,
        source_version: int,
        target_version: int,
        deleted: Sequence[Any],
    ) -> None:
        """Soft-delete removed entries when committing in place (same version)."""
        if target_version != source_version:
            return
        for entry in deleted:
            file = await self.get_file(
                file_id=entry.file_id,
                include_deleted=True,
                project_version=target_version,
            )
            if file is None:
                raise FileNotFoundError(f"File {entry.file_id} at project_version {target_version} not found")
            file.is_deleted = True

    async def _commit_renamed_entries(
        self,
        *,
        project_id: UUID,
        source_version: int,
        target_version: int,
        renamed: Sequence[Any],
    ) -> None:
        """Copy renamed entries to the target version and carry their processed artefacts."""
        for entry in renamed:
            file = await self._copy_file_to_project_version(
                file_id=entry.file_id,
                source_version=source_version,
                target_version=target_version,
                filename=entry.new_name,
            )
            file.filename = entry.new_name
            await self._carry_renamed_processed_json(
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                old_document_name=entry.old_name,
                new_document_name=entry.new_name,
            )

    async def _commit_changed_entries(
        self,
        *,
        zip_file_id: UUID,
        project_id: UUID,
        source_version: int,
        target_version: int,
        changed: Sequence[Any],
    ) -> None:
        """Copy changed entries and refresh their content from the new ZIP source."""
        in_place = target_version == source_version
        for entry in changed:
            source_file = await self.get_file(
                file_id=entry.file_id,
                include_deleted=True,
                project_version=source_version,
            )
            if source_file is None:
                raise FileNotFoundError(f"File {entry.file_id} at project_version {source_version} not found")
            await self._copy_file_to_project_version(
                file_id=entry.file_id,
                source_version=source_version,
                target_version=target_version,
            )
            await self.replace_zip_entry_document_content(
                file_id=entry.file_id,
                project_id=project_id,
                project_version=target_version,
                new_source_zip_file_id=zip_file_id if in_place else None,
                new_filename=entry.filename,
                new_bucket_source_path=entry.bucket_path,
                commit=False,
                previous_bucket_path=None if in_place else source_file.bucket_path,
            )

    async def _commit_new_entries(
        self,
        *,
        zip_file_id: UUID,
        project_id: UUID,
        source_version: int,
        target_version: int,
        new: Sequence[Any],
    ) -> None:
        """Ingest new ZIP entries into the target version."""
        in_place = target_version == source_version
        for entry in new:
            await self.ingest_zip_entry_document(
                source_zip_file_id=zip_file_id if in_place else None,
                project_id=project_id,
                project_version=target_version,
                filename=entry.filename,
                bucket_path=entry.bucket_path,
                commit=False,
            )

    async def commit_zip_diff(
        self,
        *,
        zip_file_id: UUID,
        project_id: UUID,
        source_version: int,
        target_version: int,
        dry_run: bool,
    ) -> dict[str, int | bool]:
        """Dry-run or apply DMS file-row transitions for an approved ZIP diff."""
        from src.utils.service_utils import create_zip_file_service

        await self._load_and_validate_zip_diff_source(
            zip_file_id=zip_file_id,
            project_id=project_id,
            source_version=source_version,
        )

        zip_file_service = await create_zip_file_service(db=self.db)
        diff = await zip_file_service.get_file_diff(
            zip_file_id=zip_file_id,
            use_decision=True,
            project_version=source_version,
        )
        counts: dict[str, int | bool] = {
            "dry_run": dry_run,
            "new": len(diff.new),
            "changed": len(diff.changed),
            "renamed": len(diff.renamed),
            "unchanged": len(diff.unchanged),
        }
        if dry_run:
            return counts

        try:
            await self._commit_unchanged_entries(
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                unchanged=diff.unchanged,
            )
            await self._commit_deleted_entries(
                source_version=source_version,
                target_version=target_version,
                deleted=diff.deleted,
            )
            await self._commit_renamed_entries(
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                renamed=diff.renamed,
            )
            await self._commit_changed_entries(
                zip_file_id=zip_file_id,
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                changed=diff.changed,
            )
            await self._commit_new_entries(
                zip_file_id=zip_file_id,
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                new=diff.new,
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        return counts

    async def get_versions(
        self,
        file_id: UUID,
    ) -> Sequence[File]:
        """
        Retrieve all versions of a file by its UUID (any version's ID).

        Returns:
            Sequence[File]: All versions of the file, ordered by version number
                descending. Returns empty list if no file found.
        """
        current = (
            await self.db.execute(
                select(File)
                .where(File.id == file_id)
                .order_by(File.project_version.desc(), File.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if not current:
            return []

        conditions = [
            File.project_id == current.project_id,
            File.filename == current.filename,
            File.type == current.type,
        ]

        result = await self.db.execute(
            select(File)
            .where(and_(*conditions))
            .order_by(File.project_version.desc(), File.version.desc())
            .options(selectinload(File.topics))
        )

        return result.scalars().all()

    async def list_files(
        self,
        project_id: UUID | None = None,
        project_version: int | None = None,
        name: str | None = None,
        path: str | None = None,
        file_type: FileTypeEnum | None = None,
        topic_ids: list[UUID] | None = None,
        page: int = 1,
        page_size: int | None = 50,
        include_deleted: bool = False,
    ) -> Sequence[File]:
        """
        List all files for a project, optionally filtered by file name.

        Args:
            file_type (FileTypeEnum | None): The type of file to list
            project_id (UUID | None): Optional UUID of the project.
            name (str | None): Optional search string for filename (SQL ilike).
            topic_ids (list[UUID] | None): Optional list of topic UUIDs
            path (str | None): Optional search string for bucket path (contains).
            page (int): Optional page number for paging.
            page_size(int): Optional page size for paging.
            include_deleted (bool): If True, include soft-deleted files.

        Returns:
            Sequence[File]: List of matching File DB objects.
        """

        conditions = [File.type == file_type]
        if not include_deleted:
            conditions.append(File.is_deleted.is_(False))

        if project_id is not None and project_version is None:
            project_version = await self._get_latest_project_version(project_id)

        if project_id is not None:
            conditions.append(File.project_id == project_id)

        if project_version is not None:
            conditions.append(File.project_version == project_version)

        if path:
            conditions.append(File.bucket_path.contains(path))

        if name:
            conditions.append(File.filename.ilike(f"%{name}%"))

        query = (
            select(File)
            .where(and_(*conditions))
            .order_by(File.created_at.desc(), File.id.desc())
            .options(selectinload(File.topics))
        )

        if topic_ids:
            query = (
                query.join(File.topics)
                .where(or_(FileTopic.topic_id.in_(topic_ids), FileTopic.subtopic_id.in_(topic_ids)))
                .distinct()
            )

        if page_size:
            offset = (page - 1) * page_size
            query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)

        return result.scalars().all()

    async def update_file(
        self,
        file_id: UUID,
        update_data: FileUpdateRequest,
        project_version: int | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> File | None:
        """
        Update metadata for an existing file.

        Args:
            file_id (UUID): UUID of the file to update.
            update_data (FileUpdateRequest): Data for updating the file.

        Returns:
            File | None: The updated File DB object if found, otherwise None.
        """
        file = await self.get_file(file_id=file_id, project_version=project_version)
        if not file:
            return None
        if file.project_id is not None:
            await self._validate_project_write_version(file.project_id, file.project_version)

        update_dict = update_data.model_dump(exclude_unset=True)
        if "topics" in update_dict:
            await self.update_file_topics(
                file_id=file_id,
                topic_ids=update_dict.pop("topics"),
                project_id=file.project_id,
                project_version=file.project_version,
            )

        for field, value in update_dict.items():
            setattr(file, field, value)

        if audit_context is not None and file.project_id is not None:
            await record_audit_entry(
                self.db,
                project_id=file.project_id,
                entity_type="file",
                change_type=ChangeType.UPDATE,
                entity_id=file.id,
                **audit_context,
            )
        await self.db.commit()
        await self.db.refresh(file)
        logger.info(
            action=EventAction.CHANGE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            file_id=str(file_id),
            file_path=file.bucket_path,
            message="Successfully updated file.",
        )
        return file

    async def delete_file(
        self,
        file_id: UUID,
        project_version: int,
        audit_context: dict[str, Any] | None = None,
    ) -> File:
        """
        Delete a file by marking it as deleted.

        Args:
            file_id (UUID): UUID of the file to delete.
            audit_context: Audit context kwargs forwarded to ``record_audit_entry``
                when provided and the file is project-scoped.

        Returns:
            File: The deleted File DB object if it existed.
        """

        file = await self.get_file(
            file_id=file_id,
            include_deleted=False,
            project_version=project_version,
        )
        if not file:
            raise FileNotFoundError(f"File {file_id} not found.")
        audit_project_id = file.project_id

        file.is_deleted = True
        if audit_context is not None and audit_project_id is not None:
            await record_audit_entry(
                self.db,
                project_id=audit_project_id,
                entity_type="file",
                change_type=ChangeType.DELETE,
                entity_id=file_id,
                **audit_context,
            )
        await self.db.commit()
        await self.db.refresh(file)

        logger.info(
            action=EventAction.DELETE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            file_id=str(file_id),
            file_path=file.bucket_path,
            message="Successfully soft deleted file.",
        )

        return file

    async def generate_download_url(
        self,
        file_id: UUID,
        inline: bool = False,
        include_deleted: bool = False,
        project_version: int | None = None,
        expiration_minutes: int = 4 * 60,
        internal: bool = False,
    ) -> tuple[File, str]:
        """
        Generate a signed URL to download a file from storage.

        Args:
            file_id (UUID): The unique identifier of the file.
            inline (bool): If True, the file will be displayed inline in the browser.
            include_deleted (bool): If True, allows to download soft deleted files
            expiration_minutes (int): The expiration time in minutes
                for the download URL.
            internal (bool): If True, sign the URL against the internal storage
                endpoint so server-side callers (Temporal workers) can reach it.

        Returns:
            tuple[File, str]: Returns a tuple containing
            the File object and the signed URL

        Raises:
            FileNotFoundError: If the file does not exist.
        """
        file = await self.get_file(
            file_id=file_id,
            include_deleted=include_deleted,
            project_version=project_version,
        )
        if not file:
            logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_DOWNLOAD,
                file_id=str(file_id),
                message="Failed to generate signed URL. File does not exist.",
            )
            raise FileNotFoundError(f"File '{file_id}' not found.")

        if file.workflow_status is not None and file.workflow_status != WorkflowStatusEnum.COMPLETED:
            logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_DOWNLOAD,
                file_id=str(file_id),
                file_path=file.bucket_path,
                message=f"Refusing download for file with workflow status '{file.workflow_status}'.",
            )
            raise WorkflowInPendingStateError(f"File '{file_id}' is not yet validated.")

        try:
            url = await self.storage_provider_service.generate_download_signed_url(
                document_name=file.bucket_path,
                mime_type=file.mime_type,
                inline=inline,
                expiration_minutes=expiration_minutes,
                internal=internal,
            )
            logger.info(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_DOWNLOAD,
                file_id=str(file_id),
                file_path=file.bucket_path,
                message="Generated signed download URL.",
            )
        except FileNotFoundError:
            logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_DOWNLOAD,
                file_id=str(file_id),
                file_path=file.bucket_path,
                message="Failed to generate signed URL. Bucket path does not exist.",
            )
            raise

        return file, url

    async def generate_upload_url(
        self,
        file_data: UploadRequest,
        project_version: int | None = None,
    ) -> tuple[str, str]:
        """
        Generate a signed URL to upload a file to storage.

        Args:
            file_data (UploadRequest): The metadata of the file to upload.

        Returns:
            tuple[str, str]: A signed URL and MIME type.
        """
        project_version = await self._resolve_upload_project_version(
            file_data=file_data,
            project_version=project_version,
        )
        if file_data.type in (FileTypeEnum.DOCUMENT, FileTypeEnum.ZIP, FileTypeEnum.EWMS_ZIP):
            await self._ensure_no_active_workflow(project_id=file_data.project_id)

        if file_data.type in (FileTypeEnum.ERWIDERUNGS_IMPORT, FileTypeEnum.ERWIDERUNGS_EXPORT):
            allowed_extensions = settings.ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS
            allowed_mime_types = settings.ERWIDERUNGS_ALLOWED_FILE_TYPES
        elif file_data.type in INTERNAL_FILE_TYPES:
            allowed_extensions = settings.ALLOWED_FILE_EXTENSIONS
            allowed_mime_types = settings.ALLOWED_FILE_TYPES
        else:
            allowed_extensions = settings.PUBLIC_ALLOWED_FILE_EXTENSIONS
            allowed_mime_types = settings.PUBLIC_ALLOWED_FILE_TYPES

        mime_type = validate_file_upload(
            filename=file_data.filename,
            allowed_extensions=allowed_extensions,
            allowed_mime_types=allowed_mime_types,
        )

        _, version = await self._prepare_version_and_check_conflict(
            file_data=file_data,
            project_version=project_version,
        )

        bucket_path = self._get_object_path(
            filename=file_data.filename,
            context=file_data,
            version=version,
        )
        storage = self._get_storage_for_type(file_data.type)

        try:
            url = await storage.generate_upload_signed_url(
                document_name=bucket_path, mime_type=mime_type, create_new_version=file_data.create_new_version
            )
            logger.info(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_UPLOAD,
                file_path=bucket_path,
                file_name=file_data.filename,
                message=f"Generated signed upload URL (version {version}).",
            )
        except Exception as e:
            logger.error(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.DOCUMENT_UPLOAD,
                file_path=bucket_path,
                file_name=file_data.filename,
                message=(f"Failed to generate signed upload URL (attempted version {version}): {e}"),
            )
            raise

        return url, mime_type

    async def clean_up(
        self,
        retention_days: int,
        file_type: FileTypeEnum,
    ) -> Sequence[str]:
        """
        Deletes all files older than `retention_days` days of a given type.

        Args:
            retention_days (int): The number of days to delete.
            file_type (FileTypeEnum): The type of file to delete.

        Returns:
            Sequence(str): The list of file ids deleted.
        """
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        result = await self.db.execute(
            delete(File)
            .where(File.type == file_type)
            .where(File.created_at < cutoff)
            .returning(File.id, File.bucket_path)
        )

        deleted_rows = result.fetchall()
        if not deleted_rows:
            logger.debug(
                action=EventAction.DELETE,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=(f"No {file_type.value} files older than {retention_days} days to delete."),
            )
            return []

        deleted_ids = [str(row.id) for row in deleted_rows]
        bucket_paths = [row.bucket_path for row in deleted_rows if row.bucket_path]

        logger.info(
            action=EventAction.DELETE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            message=(f"Deleting {len(deleted_ids)} old {file_type.value} files from database."),
        )
        await self.db.commit()

        for path in bucket_paths:
            try:
                await self.storage_provider_service.delete_document(document_name=path)
            except FileNotFoundError:
                logger.warn(
                    action=EventAction.DELETE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    file_path=path,
                    message="Object already deleted from storage.",
                )
            except Exception as e:
                logger.error(
                    action=EventAction.DELETE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    file_path=path,
                    message=f"Failed to delete object from storage: {e}",
                )
                raise

        return deleted_ids

    async def _ensure_no_active_workflow(
        self,
        project_id: UUID,
        blocking_states: dict[WorkflowStatusEnum, type[Exception]] | None = None,
    ) -> None:
        """
        Checks if a file is currently being processed.
        If yes an error is raised according to the status.

        Args:
            project_id (UUID): The ID of the project.
            blocking_states (dict[str, Exception | None]): Optional blocking states.
        """
        if not blocking_states:
            blocking_states = {
                WorkflowStatusEnum.REQUIRES_APPROVAL: WorkflowRequiresApprovalError,
                WorkflowStatusEnum.RUNNING: WorkflowInRunningStateError,
            }

        statuses = (
            (await self.db.execute(select(ZipFile.workflow_status).where(ZipFile.project_id == project_id)))
            .scalars()
            .all()
        )
        approval_statuses = (
            (await self.db.execute(select(ZipFile.approval_status).where(ZipFile.project_id == project_id)))
            .scalars()
            .all()
        )

        for status in set(statuses):
            if exception_cls := blocking_states.get(status):
                raise exception_cls(
                    f"Cannot upload a file or start new ZIP processing "
                    f"for project {project_id}: "
                    f"existing workflow is in state {status.value}."
                )
        if ZipApprovalStatus.REQUIRES_APPROVAL in approval_statuses or ZipApprovalStatus.APPROVING in approval_statuses:
            raise WorkflowRequiresApprovalError(
                f"Cannot upload a file or start new ZIP processing for project {project_id}: "
                "existing ZIP approval is still active."
            )

    async def _update_file_workflow_status(
        self,
        file_id: UUID,
        status: WorkflowStatusEnum,
        audit_context: dict[str, Any] | None = None,
    ) -> None:
        """Update workflow_status on a File record."""
        file = await self.get_file(file_id=file_id)
        if file is None:
            raise FileNotFoundError(f"File '{file_id}' not found.")
        file.workflow_status = status
        if audit_context is not None and file.project_id is not None:
            await record_audit_entry(
                self.db,
                project_id=file.project_id,
                entity_type="file",
                change_type=ChangeType.UPDATE,
                entity_id=file_id,
                **audit_context,
            )
        await self.db.commit()

    async def update_file_topics(
        self,
        file_id: UUID,
        topic_ids: list[UUID],
        project_id: UUID,
        project_version: int,
    ) -> None:
        """
        Replace all existing topics for a file with a new list.

        Args:
            file_id (UUID): The ID of the file.
            topic_ids (list[UUID]): The IDs of the topics to update.
            project_id (UUID): The project ID of the file.
            project_version (int): The project version of the file row.
        """
        await self.db.execute(
            delete(FileTopic).where(
                FileTopic.file_id == file_id,
                FileTopic.project_version == project_version,
            )
        )

        for topic_id in topic_ids:
            ft = FileTopic()

            ft.file_id = file_id
            ft.topic_id = topic_id
            ft.project_id = project_id
            ft.project_version = project_version
            self.db.add(ft)

    async def start_file_processing(
        self,
        payload: StartFileProcessingRequest,
        audit_context: dict[str, Any] | None = None,
    ) -> StartFileProcessingResponse:
        """
        Start a Temporal file processing workflow for the given upload request.

        Supports both ZIP files (FileProcessingWorkflow) and single files
        (SingleFileProcessingWorkflow). The correct workflow is selected
        automatically based on whether the file_id matches a ZipFile record.

        Args:
            payload (StartFileProcessingRequest): The upload request.

        Returns:
            StartFileProcessingResponse: The response from the workflow.
        """
        from src.utils.service_utils import create_zip_file_service

        await self._ensure_no_active_workflow(project_id=payload.project_id)
        workflow_actor = (
            workflow_actor_context_from_request_kwargs(audit_context) if audit_context is not None else None
        )

        zip_file_service = await create_zip_file_service(db=self.db)
        zip_file = await zip_file_service.get_zip_file(zip_file_id=payload.file_id)

        if zip_file is not None:
            return await self._start_zip_file_processing(
                payload=payload,
                zip_file=zip_file,
                zip_file_service=zip_file_service,
                workflow_actor=workflow_actor,
                audit_context=audit_context,
            )
        return await self._start_single_file_processing(
            payload=payload,
            workflow_actor=workflow_actor,
            audit_context=audit_context,
        )

    @staticmethod
    async def _start_and_resolve_workflow_status(
        *,
        workflow_run: Any,
        workflow_input: Any,
        project_id: str | None,
        project_version: int | None,
        id_reuse_policy: WorkflowIDReusePolicy,
        id_conflict_policy: WorkflowIDConflictPolicy,
        orchestrator_id: str,
    ) -> tuple[WorkflowHandle[Any, Any], Any, WorkflowStatusEnum]:
        """Start a Temporal workflow and resolve its execution status.

        Returns the workflow handle, its description, and the resolved status enum.
        """
        handle = cast(
            WorkflowHandle[Any, Any],
            await start_workflow(
                workflow_id=workflow_run,
                input=workflow_input,
                task_queue=settings.TEMPORAL.TASK_QUEUE,
                project_id=project_id,
                project_version=project_version,
                id_reuse_policy=id_reuse_policy,
                id_conflict_policy=id_conflict_policy,
                _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=orchestrator_id,
            ),
        )
        description = await handle.describe()
        if description.status is None:
            raise RuntimeError(f"Workflow {handle.id} has no execution status")
        resolved_status = WorkflowStatusEnum(description.status.name)
        return handle, description, resolved_status

    async def _start_zip_file_processing(
        self,
        *,
        payload: StartFileProcessingRequest,
        zip_file: ZipFile,
        zip_file_service: Any,
        workflow_actor: Any,
        audit_context: dict[str, Any] | None,
    ) -> StartFileProcessingResponse:
        """Start the ZIP FileProcessingWorkflow for the given ZIP file."""
        from src.services.workflows.file_processing import FileProcessingWorkflow
        from src.services.workflows.workflow_models import FileProcessingInput

        if zip_file.project_id != payload.project_id:
            raise FileNotFoundError("File not found in project.")

        current_status = zip_file.workflow_status

        await zip_file_service.update_zip_workflow_status(
            zip_file_id=payload.file_id,
            status=WorkflowStatusEnum.RUNNING,
        )
        if audit_context is not None:
            await record_audit_entry(
                self.db,
                project_id=payload.project_id,
                entity_type="zip_file",
                change_type=ChangeType.ACTION,
                action_type="start_file_processing",
                entity_id=payload.file_id,
                **audit_context,
            )
            await self.db.commit()

        _entry_type_map = {
            FileTypeEnum.ZIP: FileTypeEnum.DOCUMENT.value,
            FileTypeEnum.EWMS_ZIP: FileTypeEnum.EWMS_DOCUMENT.value,
        }
        zip_workflow_file_type: Literal["zip", "ewms_zip"] = (
            "ewms_zip" if zip_file.type == FileTypeEnum.EWMS_ZIP else "zip"
        )
        source_project_version = await self._get_latest_project_version(payload.project_id)
        workflow_input = FileProcessingInput(
            file_id=str(payload.file_id),
            filename=zip_file.filename,
            project_id=str(payload.project_id),
            file_type=zip_workflow_file_type,
            zip_path=zip_file.bucket_path,
            entry_file_type=_entry_type_map.get(zip_file.type, FileTypeEnum.DOCUMENT.value),
            source_project_version=source_project_version,
            workflow_actor=workflow_actor,
        )

        try:
            handle, description, resolved_status = await self._start_and_resolve_workflow_status(
                workflow_run=FileProcessingWorkflow.run,
                workflow_input=workflow_input,
                project_id=str(payload.project_id),
                project_version=source_project_version,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
                id_conflict_policy=WorkflowIDConflictPolicy.FAIL,
                orchestrator_id=f"FileProcessingWorkflow-{payload.project_id}",
            )
        except WorkflowAlreadyStartedError as e:
            await zip_file_service.update_zip_workflow_status(
                zip_file_id=payload.file_id,
                status=current_status,
            )
            raise WorkflowInRunningStateError(
                f"Cannot start ZIP processing for project {payload.project_id}: "
                "another ZIP processing workflow is already running."
            ) from e
        except Exception as e:
            await zip_file_service.update_zip_workflow_status(
                zip_file_id=payload.file_id,
                status=current_status,
            )
            logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Failed to start workflow for file {payload.file_id}: {e}",
            )
            raise

        return StartFileProcessingResponse(
            workflow_id=handle.id,
            run_id=description.run_id,
            workflow_status=resolved_status,
        )

    async def _start_single_file_processing(
        self,
        *,
        payload: StartFileProcessingRequest,
        workflow_actor: Any,
        audit_context: dict[str, Any] | None,
    ) -> StartFileProcessingResponse:
        """Start the SingleFileProcessingWorkflow for the given single file."""
        from src.services.workflows.single_file_processing import SingleFileProcessingWorkflow
        from src.services.workflows.workflow_models import SingleFileProcessingInput

        file = await self.get_file(file_id=payload.file_id)
        if file is None:
            raise FileNotFoundError("File not found.")

        if file.project_id != payload.project_id:
            raise FileNotFoundError("File not found in project.")

        if file.type not in (FileTypeEnum.DOCUMENT, FileTypeEnum.ERWIDERUNGS_IMPORT):
            raise ValueError(f"SingleFileProcessingWorkflow is not supported for file type '{file.type.value}'.")

        if not settings.CLAMAV.ENABLED:
            logger.info(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=f"Skipping SingleFileProcessingWorkflow for {payload.file_id}: ClamAV disabled.",
            )
            return StartFileProcessingResponse(
                workflow_id=str(payload.file_id),
                run_id="",
                workflow_status=WorkflowStatusEnum.COMPLETED,
            )

        current_status = file.workflow_status or WorkflowStatusEnum.PENDING

        await self._update_file_workflow_status(
            file_id=payload.file_id,
            status=WorkflowStatusEnum.RUNNING,
            audit_context=audit_context,
        )

        workflow_input = SingleFileProcessingInput(
            file_id=str(payload.file_id),
            bucket_path=file.bucket_path,
            filename=file.filename,
            file_type=file.type.value,
            project_id=str(file.project_id) if file.project_id else None,
            workflow_actor=workflow_actor,
        )

        try:
            handle, description, resolved_status = await self._start_and_resolve_workflow_status(
                workflow_run=SingleFileProcessingWorkflow.run,
                workflow_input=workflow_input,
                project_id=str(file.project_id) if file.project_id else None,
                project_version=file.project_version if file.project_id else None,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                orchestrator_id=str(payload.file_id),
            )
        except Exception as e:
            await self._update_file_workflow_status(
                file_id=payload.file_id,
                status=current_status,
                audit_context=audit_context,
            )
            logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Failed to start workflow for file {payload.file_id}: {e}",
            )
            raise

        return StartFileProcessingResponse(
            workflow_id=handle.id,
            run_id=description.run_id,
            workflow_status=resolved_status,
        )
