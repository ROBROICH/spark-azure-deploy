from fastapi import APIRouter, status
from fastapi.responses import JSONResponse, Response

from src.utils.app_state import app_state

probe_router = APIRouter(
    tags=["probes"],
    responses={404: {"description": "Not found"}},
)


@probe_router.get("/healthz")
def health_check() -> dict[str, str]:
    """Lightweight health check that always responds quickly."""
    return {"status": "ok"}


@probe_router.get("/ready")
def readiness_check() -> dict[str, str]:
    """Lightweight readiness probe stating that service is ready to accept traffic."""
    return {"status": "ok"}


@probe_router.get("/startup")
def startup_check() -> Response:
    """Lightweight startup probe stating that service has finished startup,
    and health and readiness probes can be executed
    """
    if app_state.startup_complete:
        return JSONResponse(content={"status": "ok"})
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "starting"},
    )
