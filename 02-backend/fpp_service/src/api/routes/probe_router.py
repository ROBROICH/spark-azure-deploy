"""Health check and readiness probe routes."""

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from src.utils.app_state import app_state

probe_router = APIRouter(tags=["Health"])


@probe_router.get("/healthz")
async def health_check():
    """
    Health check endpoint for Kubernetes liveness probe.

    Returns:
        200 OK if service is running
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "healthy"},
    )


@probe_router.get("/startup")
async def startup_check():
    """
    Startup check endpoint for Kubernetes startup probe.

    Returns:
        200 OK if service has started
        503 Service Unavailable if service is still starting
    """
    if not app_state.startup_complete:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "starting", "reason": "startup not complete"},
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "started"},
    )


@probe_router.get("/readyz")
async def readiness_check():
    """
    Readiness check endpoint for Kubernetes readiness probe.

    Returns:
        200 OK if service is ready to accept traffic
        503 Service Unavailable if service is not ready
    """
    if not app_state.startup_complete:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not ready", "reason": "startup not complete"},
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ready"},
    )
