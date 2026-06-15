"""Application lifespan — protocol_service has no own DB, no migrations to run."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.utils.app_state import app_state


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Startup / shutdown for the protocol service."""
    app_state.startup_complete = True
    yield
    app_state.startup_complete = False
