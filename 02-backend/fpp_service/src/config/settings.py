"""Configuration settings for the FPP service."""

import os
from uuid import UUID

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    SERVICE_NAME: str = "fpp-service"
    BACKEND_CORS_ORIGINS: str | list[str] = ""
    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ]

    # Database settings
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = ""

    # External service URLs
    PROJECT_LOGIC_SERVICE_URL: str = "http://project-logic-service:8000"
    AGENT_ORCHESTRATION_BASE_URL: str = "http://agent-orchestration-service:8000"
    TEMPORAL_JOB_SERVICE_URL: str

    # Default project type ID (placeholder)
    DEFAULT_PROJECT_TYPE_ID: str = "00000000-0000-0000-0000-000000000000"

    SYSTEM_USER_ID: str = "00000000-0000-0000-0000-000000000001"

    # Security settings for FPP file URL validation
    FPP_ALLOWED_DOMAINS: str | list[str] = ""
    FPP_BLOCK_PRIVATE_IPS: bool = True

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802 - env-derived settings keep existing uppercase API.
        if not self.DB_USER or not self.DB_PASSWORD or not self.DB_NAME:
            raise ValueError("DB_USER, DB_PASSWORD and DB_NAME must be set")
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def project_type_uuid(self) -> UUID:
        """Convert project type ID string to UUID."""
        return UUID(self.DEFAULT_PROJECT_TYPE_ID)

    @field_validator("BACKEND_CORS_ORIGINS", mode="after")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @field_validator("FPP_ALLOWED_DOMAINS", mode="after")
    @classmethod
    def split_allowed_domains(cls, value: str | list[str]) -> list[str]:
        """Parse comma-separated domain list from environment variable."""
        if isinstance(value, list):
            return value
        if isinstance(value, str) and value:
            return [domain.strip() for domain in value.split(",") if domain.strip()]
        return []

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
