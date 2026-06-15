from uuid import UUID

from sqlalchemy import select
from temporalio import activity

from src.config.settings import settings
from src.exceptions import ProjectNotFoundError
from src.models.db.database import AsyncSessionLocal, _init_engine
from src.models.db_models import Project, ProjectStatus
from src.services.projects import project_service


@activity.defn
async def get_project_versioning_service_endpoints() -> list[dict[str, str]]:
    return [
        {"service": "project_logic_service", "base_url": settings.API.PLS_BASE_URL},
        {"service": "document_management_service", "base_url": settings.API.DMS_BASE_URL},
        {"service": "formal_completeness_check", "base_url": settings.API.FCS_BASE_URL},
        {"service": "plausibility_notes", "base_url": settings.API.PLAUSIBILITY_BASE_URL},
        {"service": "examination_service", "base_url": settings.API.EXAMINATION_BASE_URL},
        {"service": "administrative_file_draft", "base_url": settings.API.ADMINISTRATIVE_FILE_DRAFT_BASE_URL},
        {"service": "objections_management_service", "base_url": settings.API.OBJECTIONS_BASE_URL},
    ]


@activity.defn
async def get_latest_pls_version(project_id: UUID) -> int:
    _init_engine()
    async with AsyncSessionLocal() as session:
        project = await project_service.get_project_orm(db=session, project_id=project_id)
        if project is None:
            raise ProjectNotFoundError(str(project_id))
        return project.project_version


@activity.defn
async def get_project_internal_status(project_id: UUID) -> str | None:
    _init_engine()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectStatus.internal_name)
            .join(Project, Project.status_id == ProjectStatus.id)
            .where(Project.id == project_id, Project.is_deleted.is_(False))
            .order_by(Project.project_version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
