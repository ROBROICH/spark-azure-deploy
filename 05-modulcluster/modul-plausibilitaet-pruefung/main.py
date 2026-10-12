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

from temporal.registry import PLAUSIBILITAET_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from src.activities import activities
from src.workflows.check_logic_wf.screening_context_batch_workflow import (
    PlausibilityScreeningContextBatchWorkflow,
)
from src.workflows.check_logic_wf.single_document_workflow import (
    PlausibilityCheckSingleDocumentWorkflow,
)
from src.workflows.check_logic_wf.workflow import (
    PlausibilityCheckOrchestratorWorkflow,
)
from src.workflows.orchestrator_workflow import PlausibilityMainOrchestratorWorkflow
from src.workflows.qdrant_wf.extraction_batch_workflow import ClaimExtractionBatchWorkflow
from src.workflows.qdrant_wf.workflow import (
    ClaimExtractionOrchestratorWorkflow,
    ClaimExtractionSingleDocumentWorkflow,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

workflows = [
    PlausibilityCheckOrchestratorWorkflow,
    PlausibilityCheckSingleDocumentWorkflow,
    PlausibilityScreeningContextBatchWorkflow,
    ClaimExtractionOrchestratorWorkflow,
    ClaimExtractionSingleDocumentWorkflow,
    ClaimExtractionBatchWorkflow,
    PlausibilityMainOrchestratorWorkflow,
]


async def main() -> None:
    """Initialize and run the Temporal Worker for the plausibility module."""
    target_host = ENV.TEMPORAL.HOST
    task_queue = PLAUSIBILITAET_WORKFLOW.task_queue

    logger.info("Initializing Temporal Worker Process...")
    logger.info(f"Target Temporal Host: {target_host}")
    logger.info(f"Task queue: {task_queue}")
    logger.info(f"Registered Workflows: {len(workflows)}")
    logger.info(f"Activities: {len(activities)}")

    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )

    try:
        await start_temporal_worker(
            host=target_host,
            workflows=workflows,
            activities=activities,
            task_queue=task_queue,
            storage=storage,
        )
    finally:
        shutdown_observability()
        logger.info("Temporal Worker stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Received stop signal (KeyboardInterrupt). Shutting down...")
    except Exception:
        logger.exception("Unhandled exception. Exiting.")
        sys.exit(1)
