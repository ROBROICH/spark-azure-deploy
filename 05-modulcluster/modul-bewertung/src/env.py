"""Environment settings loaded from env vars or .env files."""

import os

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel


class LiteLLMConfig(BaseModel):
    """Only the model name is needed; actual LLM calls are routed via shared temporal activities."""

    model_config = ConfigDict(extra="ignore")

    MODEL: ChatModel = Field(min_length=1)


class TemporalConfig(BaseModel):
    """Temporal connection and S3 storage settings."""
    HOST: str = Field(min_length=1)
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: SecretStr = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: SecretStr = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)


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
