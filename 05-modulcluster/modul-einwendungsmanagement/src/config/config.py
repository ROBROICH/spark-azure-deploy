"""
Application configuration — internal defaults that do not vary between deploys.
Environment-specific settings live in env.py.
"""

from typing import Literal

from pydantic import BaseModel, Field
from temporal.activities.models import ChatModel

from src.config.env import ENV


class LLMProfile(BaseModel):
    """Defines configuration parameters for a specific LLM model."""

    model_name: ChatModel = Field(
        description="LLM model name as registered in the LiteLLM proxy.",
    )
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="Controls randomness (0.0 to 1.0)")
    top_p: float = Field(1.0, ge=0.0, le=1.0, description="Nucleus sampling parameter")
    max_tokens: int = Field(15000, gt=0, description="Maximum tokens to generate")
    reasoning_effort: Literal["low", "medium", "high"] = Field(
        default="medium", description="The level of reasoning effort for the model"
    )
    llm_max_prompt_size: int = Field(
        default=300000,
        description=(
            "Maximum Size of the user prompt. Larger Prompts get truncated in the "
            "middle. The system prompt length reduces the user prompt length."
        ),
    )


class TemporalConfig(BaseModel):
    """Runtime tuning for worker/activity execution."""

    MAX_ASYNC_CONCURRENT_ACTIVITIES: int = 30
    MAX_SYNC_CONCURRENT_ACTIVITIES: int = 30
    ACTIVITY_TIMEOUT_SECONDS: int = 60
    UPLOAD_ACTIVITY_TIMEOUT_SECONDS: int = 240
    LLM_ACTIVITY_TIMEOUT_SECONDS: int = 600
    ACTIVITY_MAX_RETRIES: int = 20
    THREAD_MAX_WORKERS: int = 10
    TASK_TIMEOUT: int = 60


class DMSConfig(BaseModel):
    """DMS pagination safeguards."""

    PAGE_SIZE: int = 500
    MAX_PAGES: int = 200


class LiteLLMClientConfig(BaseModel):
    """LLM client tuning defaults."""

    TIMEOUT_SECONDS: float = 240.0
    TRUNCATION_MSG: str = "\n... [truncated] ...\n"


class EmbeddingConfig(BaseModel):
    """Settings for vector dimensions and batch loading sizes."""

    VECTOR_SIZE: int = 1024
    LOAD_BATCH_SIZE: int = 100


class ArgumentExtractionParamsConfig(BaseModel):
    """Configuration for the top-level extraction fan-out (orchestration)."""

    DOCUMENTS_BATCH_SIZE: int = 10
    CONCURRENT_BATCHES: int = 15


class ArgumentExtractionBatchParamsConfig(BaseModel):
    """Configuration for the core extraction logic within a single batch."""

    LLM_ACTIVITY_TIMEOUT_SECONDS: int = 1000
    LLM_PROFILE: LLMProfile = LLMProfile(
        model_name=ENV.LITELLM_MODEL_NAME,
        reasoning_effort="high",
    )
    SPAN_POSITIONS_BATCH_SIZE: int = 30
    SPAN_POSITIONS_TIMEOUT: int = 600
    FUZZY_ALIGNMENT_THRESHOLD: float = 0.7


class ArgumentClassificationParamsConfig(BaseModel):
    """Configuration for the top-level classification fan-out (orchestration)."""

    ARGUMENTS_BATCH_SIZE: int = 200
    CONCURRENT_BATCHES: int = 4


class ArgumentClassificationBatchParamsConfig(BaseModel):
    """Technical configuration for the LLM classification worker."""

    LLM_ACTIVITY_TIMEOUT_SECONDS: int = 1000
    LLM_PROFILE: LLMProfile = LLMProfile(
        model_name=ENV.LITELLM_MODEL_NAME,
        reasoning_effort="high",
    )
    ARGUMENTS_BATCH_SIZE: int = 8
    TOPICS_BATCH_SIZE: int = 25
    SUBTOPICS_BATCH_SIZE: int = 25


class Config:
    """Namespace container for all internal application configuration modules."""

    ARGUMENT_EXTRACTION = ArgumentExtractionParamsConfig()
    ARGUMENT_EXTRACTION_BATCH = ArgumentExtractionBatchParamsConfig()
    ARGUMENT_CLASSIFICATION = ArgumentClassificationParamsConfig()
    ARGUMENT_CLASSIFICATION_BATCH = ArgumentClassificationBatchParamsConfig()
    TEMPORAL = TemporalConfig()
    DMS = DMSConfig()
    LITELLM_CLIENT = LiteLLMClientConfig()
    EMBEDDING = EmbeddingConfig()


config = Config()
