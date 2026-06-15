"""Temporal Worker entry-point for the shared LLM client service."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
    shutdown_observability,
)
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from llm_client.embedding import _embedding_invoke
from llm_client.env import ENV
from llm_client.llm import _llm_invoke
from llm_client.vlm import _vlm_invoke

logger = logging.getLogger(__name__)

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)


async def main() -> None:
    activities = [_llm_invoke, _embedding_invoke, _vlm_invoke]
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID,
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY,
        region=ENV.TEMPORAL.S3_REGION,
    )

    try:
        await asyncio.gather(
            *(
                start_temporal_worker(
                    host=ENV.TEMPORAL.HOST,
                    workflows=[],
                    activities=activities,
                    task_queue=queue_cfg.NAME,
                    storage=storage,
                    max_concurrent_activities=queue_cfg.MAX_CONCURRENT,
                    max_task_queue_activities_per_second=queue_cfg.MAX_PER_SECOND,
                )
                for queue_cfg in ENV.queue_config
            )
        )
    finally:
        shutdown_observability()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
