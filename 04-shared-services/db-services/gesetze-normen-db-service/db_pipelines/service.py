"""FastAPI service definition"""
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from db_services_shared.fastapi import app_factory
from db_services_shared.utils.lifespan import with_migration_lifespan
from fastapi import FastAPI

from db_pipelines.config import app_config
from db_pipelines.routes.db import db_router


@with_migration_lifespan
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """
    FastAPI startup. empty decorated function to run
    alembic migrations and startup checks
    """
    yield

app = app_factory(
    app_config.SERVICE_NAME,
    settings=app_config,
    lifespan=lifespan
)

app.include_router(db_router)
