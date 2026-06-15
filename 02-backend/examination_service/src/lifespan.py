import traceback
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventSystem
from fastapi import FastAPI

from src.db.migrations.migrate import run_alembic_upgrade
from src.utils.app_state import app_state
from src.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Starts a background task."""
    try:
        run_alembic_upgrade()
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="Alembic migration failed",
            error_message=traceback.format_exc(),
        )
        raise Exception from e

    logger.info(
        action=EventAction.HEALTH,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.API,
        system_event=LogEventSystem.CONTAINER_LIFECYCLE,
        message="Alembic migrations applied successfully",
    )

    app_state.startup_complete = True

    yield

    app_state.startup_complete = False
