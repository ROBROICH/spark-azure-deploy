from uuid import UUID

from temporalio import activity

from src.models.db.database import AsyncSessionLocal
from src.models.db.workflow_enum import ZipApprovalStatus
from src.models.schemas.approval_schema import (
    DeleteChange as DeleteChangeSchema,
)
from src.models.schemas.approval_schema import (
    FileChange as FileChangeSchema,
)
from src.models.schemas.approval_schema import (
    FileDiffResponse,
)
from src.models.schemas.approval_schema import (
    NewFile as NewFileSchema,
)
from src.models.schemas.approval_schema import (
    RenameChange as RenameChangeSchema,
)
from src.models.schemas.approval_schema import (
    Unchanged as UnchangedSchema,
)
from src.services.workflows.activities.activity_models import (
    FileDiffResult,
    PersistZipDiffInput,
    UpdateZipApprovalStatusInput,
)
from src.services.zip_files.zip_file_service import ZipFileService
from src.utils.service_utils import create_zip_file_service


def _to_schema(diff: FileDiffResult) -> FileDiffResponse:
    return FileDiffResponse(
        new=[NewFileSchema(filename=item.filename, bucket_path=item.bucket_path, sha=item.sha) for item in diff.new],
        deleted=[
            DeleteChangeSchema(file_id=UUID(str(item.file_id)), filename=item.filename, sha=item.sha)
            for item in diff.deleted
        ],
        changed=[
            FileChangeSchema(
                file_id=UUID(str(item.file_id)),
                bucket_path=item.bucket_path,
                filename=item.filename,
                source_sha=item.source_sha,
                target_sha=item.target_sha,
            )
            for item in diff.changed
        ],
        renamed=[
            RenameChangeSchema(
                file_id=UUID(str(item.file_id)),
                old_name=item.old_name,
                new_name=item.new_name,
                sha=item.sha,
                bucket_path=item.bucket_path,
            )
            for item in diff.renamed
        ],
        unchanged=[
            UnchangedSchema(file_id=UUID(str(item.file_id)), filename=item.filename, sha=item.sha)
            for item in diff.unchanged
        ],
    )


@activity.defn
async def persist_zip_diff(activity_input: PersistZipDiffInput) -> None:
    async with AsyncSessionLocal() as db:
        service: ZipFileService = await create_zip_file_service(db=db)
        await service.persist_computed_diff(
            zip_file_id=UUID(activity_input.zip_file_id),
            source_project_version=activity_input.source_project_version,
            diff=_to_schema(activity_input.diff),
        )


@activity.defn
async def update_zip_approval_status(activity_input: UpdateZipApprovalStatusInput) -> None:
    status = ZipApprovalStatus(activity_input.status) if activity_input.status else None
    async with AsyncSessionLocal() as db:
        service: ZipFileService = await create_zip_file_service(db=db)
        await service.update_zip_approval_status(
            zip_file_id=UUID(activity_input.zip_file_id),
            status=status,
            error=activity_input.error,
        )
