"""Worker-only environment settings for the shared LLM client worker."""

from __future__ import annotations

import os

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LiteLLMConfig(BaseModel):
    """LiteLLM proxy connection settings."""
    BASE_URL: str = Field(min_length=1)
    MASTER_KEY: str = Field(min_length=1)
    DISK_CACHE_DIR: str | None = None


class TemporalConfig(BaseModel):
    """Temporal cluster and S3 payload storage settings."""
    HOST: str = Field(min_length=1)
    TASK_QUEUE: str = Field(default="llm", min_length=1)
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: str = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: str = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)


class QueueConfig(BaseModel):
    """Per-queue concurrency and rate-limit settings."""

    NAME: str = Field(min_length=1)
    MAX_CONCURRENT: int = Field(default=10, gt=0)
    MAX_PER_SECOND: float | None = Field(default=None)


class WorkerSettings(BaseSettings):
    """Top-level worker configuration populated from environment variables."""
    ENV: str
    QUEUE_NAME: str | None = None
    QUEUE_MAX_CONCURRENT: int | None = None
    QUEUE_MAX_PER_SECOND: float | None = None
    LITELLM: LiteLLMConfig
    TEMPORAL: TemporalConfig
    OTEL_SERVICE_NAME: str
    OTEL_ENDPOINT: str
    QUEUES: list[QueueConfig] = Field(default_factory=list)

    @property
    def queue_config(self) -> list[QueueConfig]:
        """Derive queue configs: in dev use QUEUES, otherwise single queue from env vars."""
        if self.ENV == "dev":
            return self.QUEUES
        if not self.QUEUE_NAME:
            raise ValueError("QUEUE_NAME must be set when ENV is not 'dev'")
        if self.QUEUE_MAX_CONCURRENT is None:
            raise ValueError("QUEUE_MAX_CONCURRENT must be set when ENV is not 'dev'")
        if self.QUEUE_MAX_PER_SECOND is None:
            raise ValueError("QUEUE_MAX_PER_SECOND must be set when ENV is not 'dev'")
        return [
            QueueConfig(
                NAME=self.QUEUE_NAME,
                MAX_CONCURRENT=self.QUEUE_MAX_CONCURRENT,
                MAX_PER_SECOND=self.QUEUE_MAX_PER_SECOND or None,
            )
        ]

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=True,
    )


ENV = WorkerSettings()
