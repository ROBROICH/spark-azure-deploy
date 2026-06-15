"""Shared LLM client for LiteLLM proxy — Temporal activity implementations."""

from temporal.activities.models import (
    EmbeddingActivityInput,
    LlmActivityInput,
    VlmActivityInput,
)

from llm_client.embedding import _embedding_invoke
from llm_client.llm import _llm_invoke
from llm_client.vlm import _vlm_invoke

__all__ = [
    "EmbeddingActivityInput",
    "LlmActivityInput",
    "VlmActivityInput",
    "_embedding_invoke",
    "_llm_invoke",
    "_vlm_invoke",
]
