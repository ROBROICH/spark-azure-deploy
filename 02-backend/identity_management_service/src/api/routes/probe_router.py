from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

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
    """Readiness probe — returns ok once the service has finished startup."""
    return {"status": "ok"}


@probe_router.get("/startup", response_model=None)
def startup_check() -> JSONResponse | dict[str, str]:
    """Startup probe — returns ok once startup is complete."""
    if app_state.startup_complete:
        return {"status": "ok"}
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "starting"},
    )
