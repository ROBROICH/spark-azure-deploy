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
    max_completion_tokens: int = Field(15000, gt=0, description="Maximum tokens to generate")
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


class InhaltsverzeichnisFinderParamsConfig(BaseModel):
    """Configuration parameters for Table of Contents extraction."""

    N_PAGE_SEARCH: int = 5
    MIN_CHUNK_LENGTH: int = 800
    LLM_PROFILE: LLMProfile = LLMProfile(
        model_name=ENV.LITELLM.MODEL,
        reasoning_effort="high",
    )
    EXTRACTION_ERROR_TOLERANCE_RATIO: float = 0.3
    IV_PARSER_MAX_TOKEN: int = 25000


class LLMMatchingParamsConfig(BaseModel):
    """Configuration parameters for the LLM Matching Workflow."""

    N_PAGE_SUMMARY: int = 5
    MAX_ELEMENTS_IN_CONTEXT: int = 5
    # concurrent_files seems too high
    MAX_CONCURRENT_FILES_FOR_MATCH: int = 100
    LLM_PROFILE: LLMProfile = LLMProfile(
        model_name=ENV.LITELLM.MODEL,
        reasoning_effort="high",
    )


class TemporalConfig(BaseModel):
    """Runtime tuning for worker/activity execution."""

    # concurrent_activities seems too high
    LLM_MAX_CONCURRENT_ACTIVITIES: int = 1500
    ACTIVITY_TIMEOUT_SECONDS: int = 60
    UPLOAD_ACTIVITY_TIMEOUT_SECONDS: int = 240
    ACTIVITY_MAX_RETRIES: int = 20


class DMSConfig(BaseModel):
    """DMS pagination safeguards."""

    PAGE_SIZE: int = 500
    MAX_PAGES: int = 200


class Config:
    """Central application configuration for formale-pruefung"""

    INHALTSVERZEICHNIS_FINDER = InhaltsverzeichnisFinderParamsConfig()
    LLM_MATCHING = LLMMatchingParamsConfig()
    TEMPORAL = TemporalConfig()
    DMS = DMSConfig()


config = Config()
