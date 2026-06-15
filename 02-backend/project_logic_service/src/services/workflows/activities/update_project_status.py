from uuid import UUID

from temporalio import activity

from src.models.db.database import AsyncSessionLocal, _init_engine
from src.models.schemas.project_schemas import ProjectInternalStatusEnum, UpdateProjectStatusRequest
from src.services.projects import project_service


@activity.defn
async def update_project_status(project_id: UUID, status: ProjectInternalStatusEnum) -> None:
    """
    Updates the status of a project.
    """
    _init_engine()
    async with AsyncSessionLocal() as session:
        await project_service.update_project_status(
            db=session, project_id=project_id, payload=UpdateProjectStatusRequest(internal_name=status)
        )
