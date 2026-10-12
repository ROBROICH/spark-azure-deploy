# ruff: noqa: E402
"""Entry point for the Anonymisierung Temporal worker (Docker / k8s).

Starts a single worker that handles workflows and non-LLM activities.
LLM calls are dispatched to the shared ``llm-client`` worker via the
``llm_invoke`` Temporal activity.
"""

import asyncio
import logging
import sys
from concurrent.futures import ThreadPoolExecutor

from temporal.observability import (
    ObservabilityConfig,
    TracingMode,
    setup_observability,
    shutdown_observability,
)
from temporal.registry import ANONYMISIERUNG_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from src.activities.redaction_activities import (
    apply_redactions,
    detect_pii_presidio,
    extract_texts,
)
from src.config import config
from src.env import ENV
from src.services.presidio_detector import get_analyzer
from src.workflows.redaction_workflow import RedactionWorkflow

# Enable auto-tracing AFTER workflow/activity imports to avoid
# conflict between auto_trace's _patch_module and @workflow.defn.
setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
        tracing_mode=TracingMode.MINIMAL,
    )
)

workflows = [RedactionWorkflow]
activities = [extract_texts, apply_redactions, detect_pii_presidio]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def main() -> None:
    """Initialise and run the Temporal worker.

    A single worker handles both workflows and all non-LLM activities on
    the base task queue. LLM calls are dispatched to the shared llm-client
    worker via the ``llm_invoke`` activity on the configured LLM task queue.
    """
    tc = ENV.TEMPORAL
    task_queue = ANONYMISIERUNG_WORKFLOW.task_queue
    logger.info("Starting worker on %s (queue=%s, llm=%s)", tc.HOST, task_queue, ENV.LLM_ENABLED)

    # Eagerly warm up the Presidio analyzer (loads the spaCy model into RAM)
    # so the first activity invocation does not pay the ~5-10s load cost.
    get_analyzer(config.PRESIDIO)

    storage = S3PayloadStorage(
        bucket_name=tc.S3_BUCKET_NAME,
        endpoint_url=tc.S3_ENDPOINT_URL,
        access_key=tc.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=tc.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=tc.S3_REGION,
    )

    try:
        await start_temporal_worker(
            host=tc.HOST,
            workflows=workflows,
            activities=activities,
            task_queue=task_queue,
            storage=storage,
            activity_executor=ThreadPoolExecutor(max_workers=tc.THREAD_MAX_WORKERS),
            max_concurrent_activities=tc.MAX_CONCURRENT_ACTIVITIES,
        )
    finally:
        shutdown_observability()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Received stop signal (KeyboardInterrupt). Shutting down...")
    except Exception:
        logger.exception("Worker crashed")
        sys.exit(1)
