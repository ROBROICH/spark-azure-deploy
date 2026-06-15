"""Configuration settings for the supplementary requests service."""

import os

from pydantic import ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    # Middleware Setup
    SUPPLEMENTARY_REQUESTS_SERVICE_CORS_ORIGINS: str | list[str] = ""
    BLOCKED_HTTP_METHODS: set[str] = {
        "TRACE",
        "PUT",
    }

    # Logging
    LOG_LEVEL: str = "INFO"

    # Database
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = ""
    DATABASE_URL: str = ""

    # Backend Service URL (for potential integrations)
    BACKEND_URL: str = "http://localhost:9000"

    # Service Name (for logging)
    SERVICE_NAME: str = "supplementary-requests-service"
    TEMPORAL_JOB_SERVICE_URL: str

    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def set_dsn_if_empty(cls, v: str, values: ValidationInfo) -> str:
        """Constructs the PostgreSQL DSN if not explicitly provided.

        This validator dynamically builds the `DATABASE_URL` connection string
        using the individual database configuration fields (`DB_USER`, `DB_PASSWORD`,
        `DB_HOST`, `DB_PORT`, and `DB_NAME`) if `DATABASE_URL` is not set.

        Args:
            v (str): The current value of the `DATABASE_URL` field.
            values (ValidationInfo): An object containing all previously-validated
                fields in the model, accessible via `values.data`.

        Returns:
            str: A fully constructed DSN string if `v` is empty, otherwise
                the original value.

        Example:
            If `DB_USER=user`, `DB_PASSWORD=pass`, `DB_HOST=localhost`,
            `DB_PORT=5432`, and `DB_NAME=mydb`, this will return:
            `postgresql+asyncpg://user:pass@localhost:5432/mydb`
        """
        if v:
            return v

        data = values.data
        user = data.get("DB_USER", "")
        password = data.get("DB_PASSWORD", "")
        host = data.get("DB_HOST", "localhost")
        port = data.get("DB_PORT", 5432)
        name = data.get("DB_NAME", "")

        if not all([user, password, name]):
            return ""

        return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"

    @field_validator("SUPPLEMENTARY_REQUESTS_SERVICE_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from string or list.

        Args:
            v: CORS origins as string (comma-separated) or list.

        Returns:
            List of CORS origin strings.
        """
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def validate_database_url(self) -> "Settings":
        """Ensure DATABASE_URL is set after all field validators run.

        This validator runs after the set_dsn_if_empty validator, ensuring that
        either DATABASE_URL was provided directly or was successfully constructed
        from individual DB fields.

        Raises:
            ValueError: If DATABASE_URL is empty or not set.
        """
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must be set. "
                "Provide it directly via DATABASE_URL environment variable, "
                "or set DB_USER, DB_PASSWORD, and DB_NAME to auto-construct it. "
                "For testing, override settings.DATABASE_URL in your test fixtures."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
