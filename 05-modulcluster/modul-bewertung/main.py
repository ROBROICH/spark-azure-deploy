"""Temporal Worker entry point for modul-bewertung."""

from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
)

from src.env import ENV

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)
import asyncio  # noqa: E402

from temporal.s3_payload_storage import S3PayloadStorage  # noqa: E402
from temporal.worker import start_temporal_worker  # noqa: E402
from temporal.registry import BEWERTUNG_WORKFLOW  # noqa: E402

from src.workflows.applicability import ApplicabilityWorkflow  # noqa: E402
from src.workflows.detail_planner import DetailPlannerWorkflow  # noqa: E402
from src.workflows.main_workflow import BewertungsWorkflow  # noqa: E402
from src.workflows.micro_builder import MicroBuilderWorkflow  # noqa: E402
from src.workflows.planner import PlannerWorkflow  # noqa: E402
from src.workflows.writer import WriterWorkflow  # noqa: E402


async def main() -> None:
    """Start the Temporal worker with all workflows and activities."""
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )
    await start_temporal_worker(
        host=ENV.TEMPORAL.HOST,
        workflows=[
            ApplicabilityWorkflow,
            BewertungsWorkflow,
            DetailPlannerWorkflow,
            MicroBuilderWorkflow,
            PlannerWorkflow,
            WriterWorkflow,
        ],
        activities=[],
        task_queue=BEWERTUNG_WORKFLOW.task_queue,
        storage=storage,
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
