import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI
from temporal import get_temporal_client, start_temporal_worker
from temporal.payload_codec import LargePayloadCodec
from temporal.s3_payload_storage import S3PayloadStorage

from src.config.settings import settings
from src.models.db.database import AsyncSessionLocal
from src.models.db.migrations.migrate import run_alembic_upgrade
from src.services.archiver_service import HistoryArchiver
from src.services.workflows import workflows
from src.services.workflows.activities import activities
from src.services.workflows.activities.archival import configure_archival
from src.temporal.archival import ensure_archival_schedule
from src.utils.app_state import app_state

logger = logging.getLogger(__name__)


def _session_factory():
    return AsyncSessionLocal()


async def _start_temporal_worker_task(
    storage: S3PayloadStorage,
) -> asyncio.Task[Any]:
    """Start the Temporal worker that runs the archival workflow + activities.

    Waits for the worker to signal readiness before returning so callers can
    assume the worker is polling its task queue.
    """
    ready = asyncio.Event()
    worker_task = asyncio.create_task(
        start_temporal_worker(
            host=settings.temporal.host,
            workflows=workflows,
            activities=activities,
            task_queue=settings.temporal.task_queue,
            storage=storage,
            ready=ready,
            max_concurrent_activities=2,
        ),
        name="temporal-worker",
    )

    done, _ = await asyncio.wait(
        [worker_task, asyncio.create_task(ready.wait())],
        return_when=asyncio.FIRST_COMPLETED,
    )
    if worker_task in done:
        # Worker crashed before signaling ready — propagate the exception.
        worker_task.result()
    return worker_task


async def _start_archival(client: Any, payload_storage: Any) -> tuple[asyncio.Task[Any], S3PayloadStorage]:
    archival_storage = S3PayloadStorage(
        bucket_name=settings.temporal.S3_ARCHIVAL_BUCKET_NAME,
        endpoint_url=settings.temporal.S3_ENDPOINT_URL,
        access_key=settings.temporal.S3_ACCESS_KEY_ID,
        secret_key=settings.temporal.S3_SECRET_ACCESS_KEY,
        region=settings.temporal.S3_REGION,
    )
    archiver = HistoryArchiver(
        s3=archival_storage,
        codec=LargePayloadCodec(payload_storage),
        bucket=archival_storage.bucket_name,
        prefix=settings.ARCHIVAL_S3_PREFIX,
        encryption_key=settings.ARCHIVAL_ENCRYPTION_KEY,
    )
    configure_archival(
        temporal_client=client,
        archiver=archiver,
        session_factory=_session_factory,
    )

    worker_task = await _start_temporal_worker_task(payload_storage)

    # Ensure the archival schedule exists. Idempotent — creates on first
    # boot, updates the spec on subsequent boots so env changes propagate.
    await ensure_archival_schedule(
        client,
        schedule_id=settings.ARCHIVAL_WORKFLOW_ID,
        workflow_id=settings.ARCHIVAL_WORKFLOW_ID,
        task_queue=settings.temporal.task_queue,
        cron=settings.ARCHIVAL_CRON,
        batch_size=settings.ARCHIVAL_BATCH_SIZE,
    )

    return worker_task, archival_storage


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    run_alembic_upgrade()
    payload_storage = S3PayloadStorage(
        bucket_name=settings.temporal.S3_BUCKET_NAME,
        endpoint_url=settings.temporal.S3_ENDPOINT_URL,
        access_key=settings.temporal.S3_ACCESS_KEY_ID,
        secret_key=settings.temporal.S3_SECRET_ACCESS_KEY,
        region=settings.temporal.S3_REGION,
    )
    client = await get_temporal_client(
        host=settings.temporal.host,
        namespace=settings.temporal.namespace,
        storage=payload_storage,
    )

    worker_task: asyncio.Task | None = None
    archival_storage: S3PayloadStorage | None = None
    if settings.ARCHIVAL_ENABLED:
        try:
            worker_task, archival_storage = await _start_archival(client, payload_storage)
        except Exception:
            logger.exception("failed to start archival worker; continuing without it")

    app_state.startup_complete = True
    try:
        yield
    finally:
        app_state.startup_complete = False
        if worker_task is not None:
            worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await worker_task
        for store in (payload_storage, archival_storage):
            if store is not None:
                with suppress(Exception):
                    await store.close()
