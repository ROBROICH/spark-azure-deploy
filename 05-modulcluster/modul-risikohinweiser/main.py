# ruff: noqa: E402
from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
    shutdown_observability,
)

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

from temporal.activities.llm import get_queue_for_model
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker
from temporal.workflows.risikohinweis.risikohinweis import TASK_QUEUE as RISIKOHINWEISER_TASK_QUEUE

from src.workflows.risk_checker import RiskCheckerWorkflow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

non_llm_activities: list = []

workflows = [
    RiskCheckerWorkflow,
]


def _create_storage() -> S3PayloadStorage:
    return S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID,
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY,
        region=ENV.TEMPORAL.S3_REGION,
    )


async def main() -> None:
    target_host = ENV.TEMPORAL.HOST
    task_queue = RISIKOHINWEISER_TASK_QUEUE
    model = ENV.LITELLM.MODEL
    llm_task_queue = task_queue + get_queue_for_model(model)

    main_storage = _create_storage()

    logger.info(f"Connecting to Temporal at {target_host}")
    logger.info(f"Task queues: main={task_queue}, llm={llm_task_queue}")

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                start_temporal_worker(
                    host=target_host,
                    workflows=workflows,
                    activities=non_llm_activities,
                    task_queue=task_queue,
                    storage=main_storage,
                )
            )
    except ExceptionGroup as eg:
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
        sys.exit(1)
