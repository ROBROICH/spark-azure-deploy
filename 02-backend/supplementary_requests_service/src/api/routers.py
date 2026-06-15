"""API router configuration."""

from fastapi import APIRouter

from src.api.routes.supplementary_requests import (
    router as supplementary_requests_router,
)

api_router = APIRouter()

# Include routers
api_router.include_router(supplementary_requests_router)
