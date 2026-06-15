
from contextlib import asynccontextmanager, AbstractAsyncContextManager

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventSystem,
)
from fastapi import FastAPI

from db_services_shared.models.db.migrate import run_alembic_upgrade
from db_services_shared.utils.app_state import app_state
from db_services_shared.utils.logging import get_logger
logger = get_logger("lifespan")



def with_migration_lifespan(user_lifespan_func: AbstractAsyncContextManager[FastAPI]) -> AbstractAsyncContextManager[FastAPI]:
    """
    Decorator for FastAPI lifespan context managers that runs Alembic migrations and logs errors.
    Usage:
        @with_migration_lifespan
        @asynccontextmanager
        async def lifespan(app):
            ...
    """
    @asynccontextmanager
    async def wrapper(app: FastAPI):
        try:
            run_alembic_upgrade()
        except Exception as e:
            logger.error(
                action=EventAction.HEALTH,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                default_event=LogEventSystem.CONTAINER_LIFECYCLE,
                message="Alembic migration failed",
                exc_info=True,
            )
            raise e

        try:
            async with user_lifespan_func(app):
                app_state.startup_complete = True
                yield
        except Exception as e:
            logger.error(
                action=EventAction.HEALTH,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                default_event=LogEventSystem.CONTAINER_LIFECYCLE,
                message=f"User lifespan function failed ({e})",
                exc_info=True,
            )
            raise e

        app_state.startup_complete = False
    return wrapper
