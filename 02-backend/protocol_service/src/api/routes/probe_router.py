"""Liveness / readiness / startup probes for Kubernetes."""

from event_logging.enums import EventAction, EventCategory, EventOutcome
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy.sql.expression import text

from src.models.db.database import configured_sources, get_engine
from src.models.schemas.probe_schema import CheckResponse, HealthStatus
from src.utils.app_state import app_state
from src.utils.logger import logger

probe_router = APIRouter(tags=["probes"])


@probe_router.get(
    "/healthz",
    response_model=CheckResponse,
    response_model_exclude_unset=True,
)
async def health_check() -> CheckResponse:
    """Simple liveness check — process is up."""
    return CheckResponse(status="ok")


@probe_router.get(
    "/ready",
    response_model=CheckResponse,
    response_model_exclude_unset=True,
)
async def readiness_check() -> CheckResponse | JSONResponse:
    """Readiness probe — verifies every configured source DB is reachable."""
    if not app_state.startup_complete:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=HealthStatus(status="not ready", reason="startup not complete").model_dump(),
        )

    for source_key in configured_sources():
        engine = get_engine(source_key)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as e:
            logger.error(
                action=EventAction.VALIDATE,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                message=f"Database check failed for source '{source_key}'",
                error_message=type(e).__name__,
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=HealthStatus(
                    status="not ready",
                    reason=f"source '{source_key}' unreachable",
                ).model_dump(),
            )

    return CheckResponse(status="ok")


@probe_router.get(
    "/startup",
    response_model=CheckResponse,
    response_model_exclude_unset=True,
)
async def startup_check() -> CheckResponse | JSONResponse:
    """Startup probe — application bootstrap done."""
    if app_state.startup_complete:
        return CheckResponse(status="ok")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=HealthStatus(status="starting", reason="startup in progress").model_dump(),
    )
