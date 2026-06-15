from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db_models import ProjectStatus
from src.models.schemas.generic_type_schemas import ProjectStatusResponse
from src.services.generic_type import generic_type_service

router = APIRouter(
    prefix="",
    tags=["Types/Statuses"],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)


@router.get("/project-statuses", response_model=list[ProjectStatusResponse])
async def list_project_statuses(
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectStatusResponse]:
    """Get a list of all project statuses.

    Requires admin, user, or service access.

    Args:
        db: Database session dependency

    Returns:
        List of all project statuses with id, name and internal_name
    """
    types = await generic_type_service.list_types(db=db, model=ProjectStatus)
    return [ProjectStatusResponse(id=t.id, name=t.name, internal_name=t.internal_name) for t in types]
