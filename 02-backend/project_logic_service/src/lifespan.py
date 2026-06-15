import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventSystem,
)
from fastapi import FastAPI
from temporal import start_temporal_worker
from temporal.s3_payload_storage import S3PayloadStorage

from src.config.settings import settings
from src.models.db.migrations.migrate import run_alembic_upgrade
from src.services.workflows import workflows
from src.services.workflows.activities import activities
from src.utils.app_state import app_state
from src.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application startup actions"""
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
        storage = S3PayloadStorage(
            bucket_name=settings.TEMPORAL.S3_BUCKET_NAME,
            endpoint_url=settings.TEMPORAL.S3_ENDPOINT_URL,
            access_key=settings.TEMPORAL.S3_ACCESS_KEY_ID,
            secret_key=settings.TEMPORAL.S3_SECRET_ACCESS_KEY,
            region=settings.TEMPORAL.S3_REGION,
        )
        ready = asyncio.Event()
        temporal_worker_task = asyncio.create_task(
            start_temporal_worker(
                host=settings.TEMPORAL.HOST,
                workflows=workflows,
                activities=activities,
                task_queue=settings.TEMPORAL.TASK_QUEUE,
                storage=storage,
                namespace=settings.TEMPORAL.NAMESPACE,
                ready=ready,
                # Cap concurrent activities to match the DB pool size.
                max_concurrent_activities=10,
            )
        )
        done, _ = await asyncio.wait(
            [temporal_worker_task, asyncio.create_task(ready.wait())],
            return_when=asyncio.FIRST_COMPLETED,
        )

        if temporal_worker_task in done:
            temporal_worker_task.result()
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="Failed to start temporal worker",
            error_message=str(e),
        )
        raise

    app_state.startup_complete = True

    yield

    temporal_worker_task.cancel()

    app_state.startup_complete = False
