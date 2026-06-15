"""API router aggregator."""

from fastapi import APIRouter

from src.api.routes.assignment import router as assignment_router
from src.api.routes.identity import router as identity_router

api_router = APIRouter()
api_router.include_router(identity_router)
api_router.include_router(assignment_router)
