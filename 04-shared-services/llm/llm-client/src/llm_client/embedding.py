"""Embedding Temporal activity implementation (``@activity.defn``)."""

from __future__ import annotations

import httpx
from openai import APIStatusError
from temporal.activities.models import EmbeddingActivityInput
from temporalio import activity
from temporalio.exceptions import ApplicationError

from llm_client._shared import (
    AUTH_ERROR_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES,
    get_client,
)


@activity.defn(name="embedding_invoke")
async def _embedding_invoke(input: EmbeddingActivityInput) -> list[list[float]]:
    """Compute embeddings for a list of texts via the LiteLLM proxy.

    Each activity execution makes exactly **one** API call.
    Batching across multiple activity calls is handled by the workflow-facing helper.

    Error handling:
    - 400/404/422 → ``ApplicationError(non_retryable=True)``
    - 401/403 → retryable (auth/key issues), logged as critical to fix in time
    - Network / timeout errors → re-raise so Temporal retries
    """
    client = get_client()

    if not input.texts:
        return []

    try:
        response = await client.embeddings.create(
            model=input.model, input=input.texts, encoding_format="float"
        )
    except APIStatusError as e:
        if e.status_code in AUTH_ERROR_STATUS_CODES:
            activity.logger.critical(
                f"Embedding AUTH ERROR HTTP {e.status_code} - API key/auth issue, "
                f"will be retried (ops action required): {e}"
            )
            raise
        if e.status_code in NON_RETRYABLE_STATUS_CODES:
            raise ApplicationError(
                f"Embedding HTTP {e.status_code}: {e}",
                non_retryable=True,
            ) from e
        raise
    except (httpx.TimeoutException, httpx.ConnectError, OSError):
        raise

    return [item.embedding for item in response.data]
