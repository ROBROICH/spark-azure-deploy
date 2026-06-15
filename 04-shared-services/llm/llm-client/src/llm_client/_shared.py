"""Shared OpenAI client and constants for the llm-client package."""

from __future__ import annotations

from openai import AsyncOpenAI

from llm_client.env import ENV

NON_RETRYABLE_STATUS_CODES = frozenset({404, 422})
AUTH_ERROR_STATUS_CODES = frozenset({401, 403})

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    """Return the shared OpenAI client, creating it on first access (singleton)."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = AsyncOpenAI(
            base_url=ENV.LITELLM.BASE_URL,
            api_key=ENV.LITELLM.MASTER_KEY,
            timeout=1200.0,
            max_retries=0,
        )
    return _client
