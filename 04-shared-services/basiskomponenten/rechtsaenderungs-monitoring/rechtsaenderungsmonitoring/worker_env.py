"""Environment settings loaded from env vars or .env files for the Temporal worker."""

import os

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class TemporalConfig(BaseModel):
    """Temporal connection and S3 storage settings."""

    model_config = ConfigDict(extra="ignore")

    HOST: str = Field(min_length=1)
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: SecretStr = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: SecretStr = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)


class LLMConfig(BaseModel):
    """Model names for the shared ``llm_invoke`` Temporal activity."""

    CATEGORISATION_MODEL: str
    SUMMARISATION_MODEL: str
    ENRICHMENT_MODEL: str


class WorkerSettings(BaseSettings):
    """Environment settings for the rechtsaenderungs-monitoring Temporal worker."""

    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)
    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str

    LLM: LLMConfig

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


ENV = WorkerSettings()
