from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.internal_tracking_schemas import StatusRequest
from src.services.tracking_service import TrackingService

router = APIRouter(prefix="/internal/workflows", tags=["InternalTracking"])


@router.post(
    "/status",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def status(
    req: StatusRequest,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await TrackingService(session).update_status(req)
