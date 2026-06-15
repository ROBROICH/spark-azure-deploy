from uuid import UUID

from audit_client import ChangeType, record_audit_entry
from audit_client.workflow import audit_context_from_workflow
from temporalio import activity

from src.models.db.database import AsyncSessionLocal
from src.models.db.workflow_enum import ActionEnum, ErrorCode
from src.services.workflows.activities.activity_models import (
    RenameFileInput,
    SingleFileResult,
)
from src.utils.service_utils import create_file_service


@activity.defn
async def rename_file(
    activity_input: RenameFileInput,
) -> SingleFileResult:
    activity.logger.info(
        f"Rename file '{activity_input.old_name}' to '{activity_input.new_name}' "
        f"(file_id={activity_input.file_id}, "
        f"project={activity_input.project_id}, "
        f"version={activity_input.project_version})"
    )
    audit_context = audit_context_from_workflow(None, workflow_run_id=activity.info().workflow_run_id)

    try:
        async with AsyncSessionLocal() as db:
            service = await create_file_service(db=db)
            file = await service.get_file(
                file_id=UUID(activity_input.file_id),
                project_version=activity_input.project_version,
            )
            if file is None:
                return SingleFileResult(
                    success=False,
                    filename=activity_input.new_name,
                    error_code=ErrorCode.FILE_NOT_FOUND,
                    error_message="File to rename not found in DMS",
                    action=ActionEnum.RENAME,
                )

            file.filename = activity_input.new_name
            if file.project_id is not None:
                await record_audit_entry(
                    db,
                    project_id=file.project_id,
                    entity_type="file",
                    change_type=ChangeType.UPDATE,
                    entity_id=file.id,
                    **audit_context,
                )
            await db.commit()
            await db.refresh(file)

            return SingleFileResult(
                success=True,
                filename=activity_input.new_name,
                file_id=activity_input.file_id,
                action=ActionEnum.RENAME,
            )
    except Exception as exc:
        activity.logger.error(
            f"Failed to rename file ({activity_input.file_id}) "
            f"{activity_input.old_name} to {activity_input.new_name}: {exc}"
        )
        return SingleFileResult(
            success=False,
            filename=activity_input.new_name,
            error_code=ErrorCode.RENAME_FAILED,
            error_message="Failed to rename file",
            action=ActionEnum.RENAME,
        )
