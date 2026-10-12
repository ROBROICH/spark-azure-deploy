"""Temporal Worker entry point for begruendungen-db-service."""

import sys

from db_services_shared.models.db.database import (
    get_async_session_factory,
    init_database,
)
from temporal.observability import (
    ObservabilityConfig,
    TracingMode,
    setup_observability,
)

from begruendungen_db.worker_env import ENV

if sys.gettrace() is not None or "debugpy" in sys.modules or "pydevd" in sys.modules:
    setup_observability(
        ObservabilityConfig(
            service_name=ENV.OTEL_SERVICE_NAME,
            otel_endpoint=ENV.OTEL_ENDPOINT,
            tracing_mode=TracingMode.MINIMAL,
        )
    )
elif "pytest" not in sys.modules:
    setup_observability(
        ObservabilityConfig(
            service_name=ENV.OTEL_SERVICE_NAME,
            otel_endpoint=ENV.OTEL_ENDPOINT,
        )
    )

import asyncio

from temporal.registry import BEGRUENDUNGEN_UPDATE_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from begruendungen_db.config import app_config
from begruendungen_db.workflows import make_activities, workflows


async def start_worker() -> None:
    """Start the Temporal worker with all begruendungen-db workflows and activities."""
    init_database(app_config)
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )
    await start_temporal_worker(
        host=ENV.TEMPORAL.HOST,
        workflows=workflows,
        activities=make_activities(sessionmaker=get_async_session_factory()),
        task_queue=BEGRUENDUNGEN_UPDATE_WORKFLOW.task_queue,
        storage=storage,
    )


if __name__ == "__main__":
    try:
        asyncio.run(start_worker())
    except KeyboardInterrupt:
        pass
