"""Configuration settings for the microservice."""

import os
from datetime import UTC, date, datetime, time

from pydantic import BaseModel, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class TemporalSettings(BaseModel):
    HOST: str
    TASK_QUEUE: str
    NAMESPACE: str = "default"
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: str = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: str = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)


class APISettings(BaseModel):
    TIMEOUT: int = 60
    ADMINISTRATIVE_FILE_DRAFT_BASE_URL: str
    PLS_BASE_URL: str
    DMS_BASE_URL: str
    FCS_BASE_URL: str
    PLAUSIBILITY_BASE_URL: str
    EXAMINATION_BASE_URL: str
    OBJECTIONS_BASE_URL: str


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    # Middleware Setup
    PROJECT_LOGIC_SERVICE_CORS_ORIGINS: str | list[str] = ""
    BLOCKED_HTTP_METHODS: set[str] = {
        "TRACE",
        "PUT",
    }

    SERVICE_NAME: str = "project-logic-service"
    PROJECT_CUT_OFF_DATE: datetime | None = None
    TEMPORAL_JOB_SERVICE_URL: str
    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)

    # Database configuration (can be provided either as individual fields or a full DSN)
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str

    # Full database URL (DSN). If not set, it will be constructed from the DB_* fields.
    # Example: postgresql+asyncpg://user:pass@host:5432/dbname
    DATABASE_URL: str | None = None

    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ]

    TEMPORAL: TemporalSettings
    API: APISettings

    @field_validator("PROJECT_LOGIC_SERVICE_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("PROJECT_CUT_OFF_DATE", mode="before")
    @classmethod
    def parse_project_cut_off_date(cls, v: str | date | datetime | None) -> str | datetime | None:
        """Keep date-only env values compatible by treating them as UTC day start."""
        if v is None or isinstance(v, datetime):
            return v
        if isinstance(v, date):
            return datetime.combine(v, time.min, tzinfo=UTC)
        if isinstance(v, str):
            value = v.strip()
            if not value:
                return None
            try:
                return datetime.combine(date.fromisoformat(value), time.min, tzinfo=UTC)
            except ValueError:
                return value
        return v

    @field_validator("PROJECT_CUT_OFF_DATE")
    @classmethod
    def normalize_project_cut_off_date_timezone(cls, v: datetime | None) -> datetime | None:
        """Treat naive timestamps as UTC to avoid environment-dependent comparisons."""
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def set_dsn_if_empty(cls, v: str | None, values: ValidationInfo) -> str | None:
        """
        Construct the PostgreSQL DSN from individual DB_* fields if DATABASE_URL is not set.

        This keeps local development simple (only DB_* env vars are needed) while still
        allowing an explicit DATABASE_URL override when desired.
        """
        # If DATABASE_URL is explicitly provided, respect it
        if v:
            return v

        data = values.data
        user = data.get("DB_USER", "")
        password = data.get("DB_PASSWORD", "")
        host = data.get("DB_HOST", "localhost")
        port = data.get("DB_PORT", 5432)
        name = data.get("DB_NAME", "")

        # If critical parts are missing, leave DATABASE_URL empty/None.
        # Callers are already validating that a usable URL is present.
        if not all([user, password, name]):
            return ""

        return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
