"""Configuration settings for the identity management service."""

import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    # Middleware
    IDENTITY_MANAGEMENT_SERVICE_CORS_ORIGINS: str | list[str] = ""
    BLOCKED_HTTP_METHODS: set[str] = {"TRACE", "PUT"}
    ALLOWED_HTTP_METHODS: list[str] = ["GET", "OPTIONS"]

    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = ""

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802 - env-derived settings keep existing uppercase API.
        if not self.DB_USER or not self.DB_PASSWORD or not self.DB_NAME:
            raise ValueError("DB_USER, DB_PASSWORD and DB_NAME must be set")
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Logging
    LOG_LEVEL: str = "INFO"

    # Service Name (used by EventLoggingMiddleware)
    SERVICE_NAME: str = "identity-management-service"

    TEMPORAL_JOB_SERVICE_URL: str

    @field_validator("IDENTITY_MANAGEMENT_SERVICE_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from a comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
