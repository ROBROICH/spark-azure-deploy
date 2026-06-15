"""Configuration settings for the microservice."""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = ""
    UNO_HOST: str = "localhost"
    UNO_PORT: int = 2003
    UNO_PROTOCOL: str = "http"
    SERVICE_NAME: str = "administrative-file-draft"
    PROJECT_LOGIC_SERVICE_URL: str = "http://localhost:18000"

    # CORS Configuration
    CORS_ORIGINS: list[str] = []
    ALLOWED_HTTP_METHODS: list[str] = ["GET", "POST", "PATCH", "OPTIONS"]

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        """Construct the database URL from settings."""
        if not self.DB_USER or not self.DB_PASSWORD or not self.DB_NAME:
            raise ValueError("DB_USER, DB_PASSWORD and DB_NAME must be set")
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
