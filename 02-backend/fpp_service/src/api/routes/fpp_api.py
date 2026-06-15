"""External API routes for FPP service."""

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.fpp_schemas import FPPProjectRequest, FPPProjectResponse
from src.services import fpp_service

router = APIRouter(prefix="/external/fpp", tags=["FPP"])


@router.post(
    "/projects",
    response_model=FPPProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def create_project(
    request: FPPProjectRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create a new project from FPP platform.

    This endpoint receives project creation requests from the FPP platform,
    processes the XML data, and creates a project in the project_logic_service.

    Args:
        request: FPP project creation request containing:
            - request_id: Unique request ID from FPP
            - internal_project_id: Internal project number (Aktenzeichen)
            - name: Project name (Vorhaben Name)
            - xml: Raw XML data
            - files: List of file URLs (Planunterlagen, ergänzende Unterlagen)
        db: Database session

    Returns:
        FPPProjectResponse: Created project information with status
    """
    return await fpp_service.create_project_from_fpp(request=request, db=db)
