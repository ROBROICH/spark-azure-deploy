"""Environment settings loaded from env vars or .env files."""

import os

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel
from temporal.connection_config import TemporalConfig as SharedTemporalConfig

SKIP_DOTENV = os.getenv("SKIP_DOTENV")


class LLMConfig(BaseModel):
    """LLM model and inference parameters passed to the shared llm_invoke activity."""

    model_config = ConfigDict(extra="ignore")

    MODEL: ChatModel = Field(min_length=1)
    TEMPERATURE: float = Field(default=0.0, ge=0.0, le=1.0)
    TOP_P: float = Field(default=1.0, ge=0.0, le=1.0)
    MAX_PROMPT_SIZE: int = Field(default=300000)
    PAGES_PER_CALL: int = Field(default=3, ge=1)


class TemporalConfig(SharedTemporalConfig):
    MAX_CONCURRENT_ACTIVITIES: int = Field(default=2)
    THREAD_MAX_WORKERS: int = Field(default=4)


class Settings(BaseSettings):
    """Deploy-varying settings loaded from environment variables.

    All values can be overridden via environment variables or a .env file.
    """

    model_config = SettingsConfigDict(
        env_file=[] if SKIP_DOTENV else [".env.local", ".env"],
        env_file_encoding="utf-8",
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
        case_sensitive=False,
    )

    # --- LLM ---
    LLM: LLMConfig
    LLM_ENABLED: bool = Field(default=True)
    """Kill switch for the LLM detection path.

    When ``False``, the workflow degrades cleanly to a Presidio-only
    baseline (no LLM activities scheduled). The LLM is the costly,
    external resource — Presidio always runs as deterministic baseline.
    """

    # --- Observability ---
    OTEL_SERVICE_NAME: str = Field(default="anonymisierung")
    OTEL_ENDPOINT: str

    # --- Temporal ---
    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str

    # --- OCR ---
    OCR_JOBS: int = Field(default=2, ge=1)
    OCR_TIMEOUT_SECONDS: int = Field(default=1200, ge=1)


ENV = Settings()
