"""FastAPI service definition"""

from fastapi import FastAPI, Depends
from typing import Annotated, AsyncGenerator
from contextlib import asynccontextmanager

from event_logging import EventLogger, EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventSystem

from rechtsaenderungsmonitoring.config import app_config  # noqa: F401
from db_services_shared.utils.logging import get_logger

from temporal.worker import get_temporal_client

from rechtsaenderungsmonitoring.routes.temporal import (
    ensure_rechtsaenderungen_schedule,
    temporal_router,
)
from rechtsaenderungsmonitoring.routes.db import db_router

from db_services_shared.utils.lifespan import with_migration_lifespan
from db_services_shared.fastapi import app_factory

LoggerDep = Annotated[EventLogger, Depends(get_logger)]

logger = get_logger(__name__)


@with_migration_lifespan
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """run migrations and configure logger on application startup"""
    logger = get_logger("lifespan")

    client = await get_temporal_client(host=app_config.temporal.host)
    # not reliable yet
    # await ensure_rechtsaenderungen_schedule(client)

    yield
    logger.info(
        action=EventAction.HEALTH,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.SERVICE,
        system_event=LogEventSystem.CONTAINER_LIFECYCLE,
        message="shutting down",
    )


app = app_factory(
    service_name="Rechtsänderungsmonitoring",
    settings=app_config,
    lifespan=lifespan,
    debug=app_config.log_level == "DEBUG",
)

app.include_router(db_router)
app.include_router(temporal_router)
