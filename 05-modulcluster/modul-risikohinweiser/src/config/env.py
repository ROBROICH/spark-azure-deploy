"""Environment settings loaded from env vars or .env files."""

import os

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.llm import ChatModel
from temporal.connection_config import TemporalConfig


class LiteLLMConfig(BaseModel):
    """LiteLLM model selection. Actual proxy connection is handled by the shared llm-client workers."""

    MODEL: ChatModel = Field(min_length=1)


class Settings(BaseSettings):
    """Strict environment settings. All fields are required unless defaults are set."""

    LITELLM: LiteLLMConfig
    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str
    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


ENV = Settings()
