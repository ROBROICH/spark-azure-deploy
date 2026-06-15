"""Configuration settings for the Objections Management microservice."""

import os

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    CORS_ORIGINS: str | list[str] = ""
    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ]

    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "objections_db"
    SERVICE_NAME: str = "objections-management-service"
    TEMPORAL_JOB_SERVICE_URL: str
    DOCUMENT_MANAGEMENT_SERVICE_URL: str = "http://document-management-service:8000"
    PROJECT_LOGIC_SERVICE_URL: str = "http://project-logic-service:8000"
    EXTERNAL_SERVICE_TIMEOUT_SECONDS: float = 30.0

    DATABASE_URL_OVERRIDE: str | None = Field(
        default=None,
        alias="DATABASE_URL",
        description="Direct connection string override",
    )

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE
        if not self.DB_USER or not self.DB_PASSWORD or not self.DB_NAME:
            raise ValueError("DB_USER, DB_PASSWORD and DB_NAME must be set")
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        """Parses a comma-separated string of CORS origins into a list."""
        if isinstance(v, list):
            return [origin.strip() for origin in v if origin.strip()]
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
