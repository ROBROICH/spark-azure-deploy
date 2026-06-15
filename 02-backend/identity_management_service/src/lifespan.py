from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from authentification.dependencies import get_auth_client
from event_logging import EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventSystem
from fastapi import FastAPI

from src.models.db.database import AsyncSessionLocal
from src.models.db.migrations.migrate import run_alembic_upgrade
from src.services.auth_migration.migrator import SpiceDBMigrator
from src.utils.app_state import app_state
from src.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Mark service as ready on startup; reset on shutdown."""
    try:
        run_alembic_upgrade()
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="Alembic migration failed",
            error_message=str(e),
        )
        raise

    try:
        client = await get_auth_client()
        async with AsyncSessionLocal() as db:
            await SpiceDBMigrator(client=client, db=db).upgrade()
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="SpiceDB migration failed",
            error_message=str(e),
        )
        raise

    app_state.startup_complete = True
    yield
    app_state.startup_complete = False
