from uuid import UUID

from audit_client.workflow import audit_context_from_workflow
from temporalio import activity

from src.models.db.database import AsyncSessionLocal
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import ActionEnum, ErrorCode
from src.services.workflows.activities.activity_models import (
    IngestFileInput,
    SingleFileResult,
)
from src.utils.service_utils import create_file_service


@activity.defn
async def ingest_file(
    activity_input: IngestFileInput,
) -> SingleFileResult:
    activity.logger.info(
        f"Ingest file '{activity_input.filename}' "
        f"(bucket_path={activity_input.bucket_path}, "
        f"project={activity_input.project_id}, "
        f"version={activity_input.project_version}, "
        f"existing_file_id={activity_input.file_id})"
    )
    zip_file_id = UUID(activity_input.zip_file_id)
    project_id = UUID(activity_input.project_id)
    file_type = FileTypeEnum(activity_input.entry_file_type)
    audit_context = audit_context_from_workflow(None, workflow_run_id=activity.info().workflow_run_id)

    try:
        async with AsyncSessionLocal() as db:
            service = await create_file_service(db=db)

            if activity_input.file_id is None:
                created = await service.ingest_zip_entry_document(
                    source_zip_file_id=zip_file_id,
                    project_id=project_id,
                    project_version=activity_input.project_version,
                    filename=activity_input.filename,
                    bucket_path=activity_input.bucket_path,
                    file_type=file_type,
                    audit_context=audit_context,
                )
            else:
                created = await service.replace_zip_entry_document_content(
                    file_id=UUID(activity_input.file_id),
                    project_id=project_id,
                    project_version=activity_input.project_version,
                    new_source_zip_file_id=zip_file_id,
                    new_filename=activity_input.filename,
                    new_bucket_source_path=activity_input.bucket_path,
                    file_type=file_type,
                    audit_context=audit_context,
                )

            return SingleFileResult(
                success=True,
                filename=activity_input.filename,
                file_id=str(created.id),
                action=ActionEnum.INGEST,
            )
    except FileNotFoundError:
        return SingleFileResult(
            success=False,
            filename=activity_input.filename,
            error_code=ErrorCode.FILE_NOT_FOUND,
            error_message="File to move into DMS not found in storage",
            action=ActionEnum.INGEST,
        )
    except Exception as exc:
        activity.logger.error(f"Failed to ingest file {activity_input.filename}: {exc}")
        return SingleFileResult(
            success=False,
            filename=activity_input.filename,
            error_code=ErrorCode.UPLOAD_FAILED,
            error_message="Failed to ingest file",
            action=ActionEnum.INGEST,
        )
