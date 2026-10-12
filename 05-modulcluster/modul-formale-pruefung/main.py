# ruff: noqa: E402
from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
    shutdown_observability,
)

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

from temporal.registry import FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW
from temporal.worker import start_temporal_worker

from src.activities import activities
from src.services.payload_storage import create_payload_storage
from src.workflows import workflows

logger = logging.getLogger(__name__)


async def main():
    """
    Initialize and run two Temporal Workers in parallel.

    The main worker handles workflows and non-LLM activities on the base task queue.
    The LLM worker handles LLM activities on a dedicated '{base}-llm' task queue
    with limited concurrency to prevent overloading.
    """
    target_host = ENV.TEMPORAL.HOST
    task_queue = FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW.task_queue

    logger.info("Initializing Temporal Worker Process....")
    logger.info(f"Target Temporal Host: {target_host}")
    logger.info(f"Main task queue: {task_queue}")
    logger.info(f"Registered Workflows: {len(workflows)}")
    logger.info(f"Activities: {len(activities)}")
    logger.info(f"LLM max concurrent activities: {config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES}")

    main_storage = create_payload_storage()

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                start_temporal_worker(
                    host=target_host,
                    workflows=workflows,
                    activities=activities,
                    task_queue=task_queue,
                    storage=main_storage,
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
