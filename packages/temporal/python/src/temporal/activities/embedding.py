"""Workflow-facing helper for the ``embedding_invoke`` Temporal activity."""

from __future__ import annotations

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from temporal.activities.models import EmbeddingActivityInput, EmbeddingModel, get_queue_for_model

_BATCH_SIZE = 1000

_DEFAULT_RETRY = RetryPolicy(
    maximum_attempts=5,
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
)


async def embedding_invoke(
    texts: list[str],
    model: EmbeddingModel,
    *,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
) -> list[list[float]]:
    """Call the shared ``embedding_invoke`` activity and return the embedding vectors.

    Splits *texts* into batches of up to 1 000 and dispatches each batch as a
    separate activity execution so that Temporal can manage concurrency, retries
    and rate-limiting per batch.

    Can **only** be called from within a Temporal workflow.
    The task queue is auto-resolved from the model name.
    """
    if not texts:
        return []

    resolved_queue = get_queue_for_model(model)
    batches = [texts[i : i + _BATCH_SIZE] for i in range(0, len(texts), _BATCH_SIZE)]

    results: list[list[list[float]]] = await asyncio.gather(*[
        workflow.execute_activity(
            "embedding_invoke",
            EmbeddingActivityInput(texts=batch, model=model),
            task_queue=resolved_queue,
            start_to_close_timeout=timedelta(seconds=300),
            retry_policy=retry_policy,
        )
        for batch in batches
    ])

    return [emb for batch_result in results for emb in batch_result]