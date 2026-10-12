"""Environment settings loaded from env vars or .env files for the Temporal worker."""

import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.connection_config import TemporalConfig


class WorkerSettings(BaseSettings):
    """Environment settings for the jura-db Temporal worker."""

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


ENV = WorkerSettings()
