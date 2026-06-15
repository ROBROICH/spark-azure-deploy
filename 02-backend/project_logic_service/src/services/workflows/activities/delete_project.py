from audit_client.workflow import audit_context_from_workflow
from temporalio import activity

from src.models.db.database import AsyncSessionLocal, _init_engine
from src.services.projects import project_service
from src.services.workflows.workflow_models import DeleteProjectInput


@activity.defn
async def delete_project(workflow_input: DeleteProjectInput) -> None:
    """Soft-delete project rows and write the audit entry in the same transaction."""
    _init_engine()
    async with AsyncSessionLocal() as session:
        audit_context = audit_context_from_workflow(
            workflow_input.workflow_actor,
            workflow_run_id=activity.info().workflow_run_id,
        )
        await project_service.set_project_deleted(
            db=session,
            project_id=workflow_input.project_id,
            audit_context=audit_context,
        )
