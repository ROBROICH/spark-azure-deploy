from uuid import UUID

from audit_client import ChangeType, record_audit_entry
from audit_client.workflow import audit_context_from_workflow
from sqlalchemy import select
from temporalio import activity

from src.models.db.database import AsyncSessionLocal
from src.models.db.db_models import ZipFile
from src.models.db.workflow_enum import WorkflowStatusEnum
from src.services.workflows.activities.activity_models import UpdateFileStatusInput


def _parse_workflow_status(status_raw: str) -> WorkflowStatusEnum:
    """Parse status by direct enum cast (no normalization)."""
    status_clean = status_raw.strip()
    if not status_clean:
        raise ValueError("Workflow status is required.")

    return WorkflowStatusEnum(status_clean)


@activity.defn
async def update_file_status(activity_input: UpdateFileStatusInput) -> None:
    """Update workflow status of every copied ZIP row with this id."""
    workflow_status = _parse_workflow_status(activity_input.status)
    zip_file_id = UUID(activity_input.zip_file_id)
    try:
        audit_context = audit_context_from_workflow(
            None,
            workflow_run_id=activity.info().workflow_run_id,
        )
    except RuntimeError:
        audit_context = None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ZipFile).where(ZipFile.id == zip_file_id))
        zip_files = list(result.scalars().all())
        if not zip_files:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")

        for zip_file in zip_files:
            zip_file.workflow_status = workflow_status
            if zip_file.project_id is not None and audit_context is not None:
                await record_audit_entry(
                    db,
                    project_id=zip_file.project_id,
                    entity_type="zip_file",
                    change_type=ChangeType.UPDATE,
                    entity_id=zip_file.id,
                    **audit_context,
                )
        await db.commit()
