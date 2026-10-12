# ruff: noqa: E402
from temporal.observability import ObservabilityConfig, setup_observability, shutdown_observability

from src.config.config import config
from src.config.env import ENV

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)
import asyncio
import logging
import sys
from concurrent.futures import ThreadPoolExecutor

from temporal.registry import EINWENDUNGSMANAGEMENT_ARGUMENT_EXTRACTION_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from src.activities import activities
from src.workflows import workflows

logger = logging.getLogger(__name__)


def _create_storage() -> S3PayloadStorage:
    return S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )


async def main():
    """
    Initialize and run two Temporal Workers in parallel.

    The main worker handles workflows and non-LLM activities on the base task queue.
    The LLM worker handles LLM activities on a dedicated '{base}-llm' task queue
    with limited concurrency to prevent overloading.
    """
    target_host = ENV.TEMPORAL.HOST
    task_queue = EINWENDUNGSMANAGEMENT_ARGUMENT_EXTRACTION_WORKFLOW.task_queue

    logger.info("Initializing Temporal Worker Process....")
    logger.info(f"Target Temporal Host: {target_host}")
    logger.info(f"Main task queue: {task_queue}")
    logger.info(f"Registered Workflows: {len(workflows)}")
    logger.info(f"Activities: {len(activities)}")
    logger.info(f"max sync concurrent activities: {config.TEMPORAL.MAX_SYNC_CONCURRENT_ACTIVITIES}")
    logger.info(f"max async concurrent activities: {config.TEMPORAL.MAX_ASYNC_CONCURRENT_ACTIVITIES}")

    main_storage = _create_storage()

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                start_temporal_worker(
                    host=target_host,
                    workflows=workflows,
                    activities=activities,
                    task_queue=task_queue,
                    storage=main_storage,
                    activity_executor=ThreadPoolExecutor(max_workers=config.TEMPORAL.THREAD_MAX_WORKERS),
                )
            )
    except ExceptionGroup as eg:
        logger.exception("Fatal error encountered in Temporal Workers.")
        raise eg.exceptions[0] from eg
    else:
        logger.info("Temporal Workers stopped gracefully.")
    finally:
        shutdown_observability()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Received stop signal (KeyboardInterrupt). Shutting down...")
    except Exception:
        logger.exception("Unhandled exception. Exiting.")
        sys.exit(1)
