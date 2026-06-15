from fastapi.exceptions import HTTPException
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
)
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio.session import AsyncSession
from sqlalchemy.sql.expression import text

from db_services_shared.api.schemas.probe_schema import (
    CheckResponse,
    HealthStatus,
)
from db_services_shared.models.db.database import get_db_session
from db_services_shared.utils.app_state import app_state
from db_services_shared.utils.logging import get_logger
logger = get_logger("db-service")

probe_router = APIRouter(tags=["probes"])


@probe_router.get(
    "/healthz",
    response_model=CheckResponse,
    response_model_exclude_unset=True,
)
def health_check() -> CheckResponse:
    """Simple health check endpoint."""
    return CheckResponse(status="ok")


@probe_router.get(
    "/ready",
    response_model_exclude_unset=True,
)
async def readiness_check(
    db: AsyncSession = Depends(get_db_session),
) -> CheckResponse:
    """
    Readiness probe: verifies database connectivity.
    """
    if not app_state.startup_complete:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=HealthStatus(
                status="not ready",
                reason="startup not complete",
            ).model_dump()
        )

    # Database check
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            message=f"Database check failed: {e}",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=HealthStatus(
                status="not ready",
                reason="database unreachable",
            ).model_dump()
        ) from e

    return CheckResponse(status="ok")  # type: ignore


@probe_router.get(
    "/startup",
    response_model_exclude_unset=True,
)
async def startup_check() -> CheckResponse:
    """Startup probe: signals when application initialization is complete.

    Kubernetes will delay liveness/readiness probes until this succeeds.
    """
    if app_state.startup_complete:
        return CheckResponse(status="ok")

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=HealthStatus(
            status="starting",
            reason="startup in progress",
        ).model_dump(),
    )
