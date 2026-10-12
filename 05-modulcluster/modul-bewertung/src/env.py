"""Environment settings loaded from env vars or .env files."""

import os

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel
from temporal.connection_config import TemporalConfig


class LiteLLMConfig(BaseModel):
    """Only the model name is needed; actual LLM calls are routed via shared temporal activities."""

    model_config = ConfigDict(extra="ignore")

    MODEL: ChatModel = Field(min_length=1)


class Settings(BaseSettings):
    """Strict environment settings. All fields are required unless defaults are set."""

    LITELLM: LiteLLMConfig
    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)
    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


ENV = Settings()
