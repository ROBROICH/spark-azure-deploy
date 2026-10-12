"""Pydantic wire-format models for LLM/VLM/Embedding Temporal activities.

This module is intentionally side-effect-free: no ``@activity.defn``,
no OpenAI client initialisation.  Safe to import from both activity
implementations (``llm_client``) and workflow helpers (``temporal.activities``).
"""

from __future__ import annotations

from enum import StrEnum
from typing import TypeAlias

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Provider enum
# ---------------------------------------------------------------------------


class Provider(StrEnum):
    NVIDIA = "nvidia"
    IONOS = "ionos"
    MISTRAL = "mistral"
    VERTEX = "vertex"
    HUGGINGFACE = "huggingface"
    CUSTOM = "custom"


# ---------------------------------------------------------------------------
# Model type aliases (actual models configured in LiteLLM proxy ConfigMap)
# ---------------------------------------------------------------------------

ChatModel: TypeAlias = str
VlmModel: TypeAlias = str
EmbeddingModel: TypeAlias = str


# ---------------------------------------------------------------------------
# Model → provider routing
#
# Primary: prefix-based convention  (<provider>/<model-name>)
# Fallback: explicit mapping for names that don't follow the convention
# ---------------------------------------------------------------------------

_PREFIX_TO_PROVIDER: dict[str, Provider] = {
    "nvidia": Provider.NVIDIA,
    "ionos": Provider.IONOS,
    "mistral": Provider.MISTRAL,
    "gcp": Provider.VERTEX,
    "hf": Provider.HUGGINGFACE,
    "self-hosted": Provider.CUSTOM,
}

# Specific Model -> Provider overrides for models that don't follow the prefix convention
_MODEL_PROVIDER_OVERRIDE: dict[str, Provider] = {
    "Qwen/Qwen3-235B-A22B-Instruct-2507": Provider.VERTEX,
    "meta/llama-3.3-70b-instruct-maas": Provider.VERTEX,
    "mistral-small-2506": Provider.MISTRAL,
    "ministral-14b-2512": Provider.MISTRAL,
}

_PROVIDER_QUEUE: dict[Provider, str] = {
    Provider.NVIDIA: "llm-nvidia",
    Provider.IONOS: "llm-ionos",
    Provider.MISTRAL: "llm-mistral",
    Provider.VERTEX: "llm-vertex",
    Provider.HUGGINGFACE: "llm-huggingface",
    Provider.CUSTOM: "llm-custom",
}


def resolve_provider(model: str) -> Provider:
    """Resolve provider from model name.

    Strategy:
    1. Check explicit override mapping.
    2. Use prefix-based convention (``<provider>/<model-name>``).
    3. Fall back to CUSTOM for unrecognised models.
    """
    if model in _MODEL_PROVIDER_OVERRIDE:
        return _MODEL_PROVIDER_OVERRIDE[model]
    if "/" in model:
        prefix = model.split("/")[0]
        if prefix in _PREFIX_TO_PROVIDER:
            return _PREFIX_TO_PROVIDER[prefix]
    return Provider.CUSTOM


def get_queue_for_model(model: str) -> str:
    """Return the Temporal task queue for *model*."""
    return _PROVIDER_QUEUE[resolve_provider(model)]


# ---------------------------------------------------------------------------
# Pydantic wire-format models
# ---------------------------------------------------------------------------


class LlmActivityInput(BaseModel):
    """Wire-format input for the ``llm_invoke`` Temporal activity."""

    prompt: str
    system_prompt: str
    model: ChatModel
    temperature: float = 0.3
    top_p: float = 0.95
    max_tokens: int | None = None
    max_completion_tokens: int | None = None
    response_schema: dict[str, object] | None = None
    schema_name: str | None = None
    reasoning_effort: str | None = None
    no_cache: bool = False


class VlmActivityInput(BaseModel):
    """Wire-format input for the ``vlm_invoke`` Temporal activity."""

    image_b64: str
    image_mime: str
    prompt: str
    system_prompt: str = ""
    model: VlmModel
    temperature: float = 0.3
    max_completion_tokens: int | None = None
    frequency_penalty: float = 0
    presence_penalty: float = 0
    top_p: float = 0.9


class EmbeddingActivityInput(BaseModel):
    """Wire-format input for the ``embedding_invoke`` Temporal activity."""

    texts: list[str]
    model: EmbeddingModel
