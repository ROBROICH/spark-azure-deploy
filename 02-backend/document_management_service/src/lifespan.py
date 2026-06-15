import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress

from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventSystem
from fastapi import FastAPI
from temporal import start_temporal_worker
from temporal.s3_payload_storage import S3PayloadStorage

from src.config.settings import settings
from src.models.db.database import AsyncSessionLocal
from src.models.db.file_enum import FileTypeEnum
from src.models.db.migrations.migrate import run_alembic_upgrade
from src.services.workflows import workflows
from src.services.workflows.activities import activities
from src.utils.app_state import app_state
from src.utils.logger import logger
from src.utils.service_utils import (
    create_file_service,
    get_or_create_quarantine_storage_provider,
    get_or_create_storage_provider,
)


def _register_background_task(task: asyncio.Task[None], task_name: str) -> None:
    """Track background task and log unexpected failures."""

    def _log_task_failure(done_task: asyncio.Task[None]) -> None:
        if done_task.cancelled():
            return
        error = done_task.exception()
        if error is None:
            return
        logger.error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message=f"Background task '{task_name}' failed: {error}",
        )

    task.add_done_callback(_log_task_failure)
    app_state.background_tasks.append(task)


async def run_cleanup_loop() -> None:
    """
    Background task to clean up DMS.
    """
    while True:
        try:
            async with AsyncSessionLocal() as db:
                file_service = await create_file_service(db)
                deleted_ids = await file_service.clean_up(
                    retention_days=settings.CHECKPOINT_RETENTION_PERIOD_DAYS,
                    file_type=FileTypeEnum.TEMPORAL_CHECKPOINT,
                )
            logger.info(
                action=EventAction.DELETE,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=(f"Temporal checkpoint cleanup completed — deleted {len(deleted_ids)} files"),
            )
            logger.debug(
                action=EventAction.DELETE,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                message=f"Deleted files: {deleted_ids}",
            )
        except asyncio.CancelledError:
            logger.info(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.FILE,
                message="Cleanup task cancelled during shutdown.",
            )
            raise
        except Exception as e:
            logger.error(
                action=EventAction.DELETE,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Cleanup task failed (will retry later): {e}",
            )
        await asyncio.sleep(60 * 60 * 6)


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
        )
        raise Exception from e

    try:
        cleanup_task = asyncio.create_task(run_cleanup_loop())
        _register_background_task(cleanup_task, "run_cleanup_loop")
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="Failed to start cleanup task",
        )
        raise Exception from e

    try:
        temporal_storage = S3PayloadStorage(
            bucket_name=settings.TEMPORAL.S3_BUCKET_NAME,
            endpoint_url=settings.TEMPORAL.S3_ENDPOINT_URL,
            access_key=settings.TEMPORAL.S3_ACCESS_KEY_ID,
            secret_key=settings.TEMPORAL.S3_SECRET_ACCESS_KEY,
            region=settings.TEMPORAL.S3_REGION,
        )
        temporal_worker_ready = asyncio.Event()
        temporal_worker_task = asyncio.create_task(
            start_temporal_worker(
                host=settings.TEMPORAL.HOST,
                workflows=workflows,
                activities=activities,
                task_queue=settings.TEMPORAL.TASK_QUEUE,
                storage=temporal_storage,
                namespace=settings.TEMPORAL.NAMESPACE,
                ready=temporal_worker_ready,
            )
        )
        _register_background_task(temporal_worker_task, "start_temporal_worker")
        ready_task = asyncio.create_task(temporal_worker_ready.wait())
        done, pending = await asyncio.wait(
            [temporal_worker_task, ready_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        if temporal_worker_task in done:
            for pending_task in pending:
                pending_task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            temporal_worker_task.result()
    except Exception as e:
        logger.error(
            action=EventAction.HEALTH,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="Failed to start temporal worker",
        )
        raise Exception from e

    storage_provider_service = await get_or_create_storage_provider()
    quarantine_storage_provider_service = await get_or_create_quarantine_storage_provider()

    if not settings.CLAMAV.ENABLED:
        logger.warn(
            action=EventAction.HEALTH,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message="ClamAV virus scanning is DISABLED. All uploads will bypass scanning.",
        )
    if not settings.QUARANTINE_BUCKET_NAME:
        logger.warn(
            action=EventAction.HEALTH,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.API,
            system_event=LogEventSystem.CONTAINER_LIFECYCLE,
            message=(
                "QUARANTINE_BUCKET_NAME is not set. "
                "User uploads go directly to the clean bucket without quarantine isolation."
            ),
        )

    app_state.storage_provider_service = storage_provider_service
    app_state.quarantine_storage_provider_service = quarantine_storage_provider_service
    app_state.startup_complete = True

    yield

    for task in app_state.background_tasks:
        task.cancel()

        with suppress(asyncio.CancelledError):
            await task

    app_state.startup_complete = False
    await storage_provider_service.close()
    if quarantine_storage_provider_service is not storage_provider_service:
        await quarantine_storage_provider_service.close()
    app_state.storage_provider_service = None
    app_state.quarantine_storage_provider_service = None
