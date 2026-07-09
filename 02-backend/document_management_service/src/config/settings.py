"""Configuration settings for the microservice."""

import os

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ClamAVSettings(BaseModel):
    ENABLED: bool = False
    BASE_URL: str = "http://clamav-api.clamav-system.svc.cluster.local:6000"
    TIMEOUT_SECONDS: int = 600


class TemporalSettings(BaseModel):
    HOST: str
    TASK_QUEUE: str
    NAMESPACE: str
    PLS_TASK_QUEUE: str
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: str = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: str = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)
    ENABLE_APPROVAL: bool


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    # Deployment environment. When set to "production", security-critical
    # controls (e.g. malware scanning) are enforced fail-closed at startup.
    ENV: str

    SERVICE_NAME: str

    OTEL_SERVICE_NAME: str
    OTEL_ENDPOINT: str

    # Middleware Setup
    CORS_ORIGINS: str | list[str]
    BLOCKED_HTTP_METHODS: set[str] = {
        "TRACE",
        "PUT",
    }
    MAX_ZIP_EXTRACTION_SIZE_GB: int
    MAX_SINGLE_ENTRY_SIZE_MB: int
    MAX_ZIP_ENTRIES: int
    MAX_COMPRESSION_RATIO: int
    MAX_DIFF_HASH_CONCURRENCY: int = Field(default=8, ge=1)

    @property
    def MAX_ZIP_EXTRACTION_SIZE_BYTES(self) -> int:  # noqa: N802
        return self.MAX_ZIP_EXTRACTION_SIZE_GB * 1024 * 1024 * 1024

    @property
    def MAX_SINGLE_ENTRY_SIZE_BYTES(self) -> int:  # noqa: N802
        return self.MAX_SINGLE_ENTRY_SIZE_MB * 1024 * 1024

    # Database
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Storage Provider Config
    BUCKET_NAME: str
    DOC_STORE_PATH: str

    # S3 Config
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_EXTERNAL_URL: str | None = None
    S3_ENDPOINT_URL: str | None = None
    S3_REGION: str | None = None

    # Retention period for Temporal data
    CHECKPOINT_RETENTION_PERIOD_DAYS: int
    PROJECT_LOGIC_SERVICE_URL: str
    TEMPORAL_JOB_SERVICE_URL: str

    # File upload configuration — public (user-facing) types
    PUBLIC_ALLOWED_FILE_TYPES: set[str] = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "application/zip",
    }

    PUBLIC_ALLOWED_FILE_EXTENSIONS: dict[str, str] = {
        ".zip": "application/zip",
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }

    ERWIDERUNGS_ALLOWED_FILE_TYPES: set[str] = {
        "text/csv",
    }

    ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS: dict[str, str] = {
        ".csv": "text/csv",
    }

    # File upload configuration — files extracted from ZIP uploads
    ZIP_ENTRY_ALLOWED_FILE_TYPES: set[str] = {
        "application/pdf",
    }

    ZIP_ENTRY_ALLOWED_FILE_EXTENSIONS: dict[str, str] = {
        ".pdf": "application/pdf",
    }

    # All allowed types including internal (service-to-service) types
    ALLOWED_FILE_TYPES: set[str] = PUBLIC_ALLOWED_FILE_TYPES | {
        "application/json",
        "text/markdown",
    }

    ALLOWED_FILE_EXTENSIONS: dict[str, str] = {
        **PUBLIC_ALLOWED_FILE_EXTENSIONS,
        ".json": "application/json",
        ".md": "text/markdown",
    }

    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ]

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        """Parses a comma-separated string of CORS origins into a list.

        This validator is used to convert the CORS_ORIGINS environment
        variable or config value into a list of origin strings. It trims whitespace
        and ignores empty values.

        Args:
            v (str | list[str]): A comma-separated string of origins
                (e.g., "http://localhost, https://example.com") or a list.

        Returns:
            list[str]: A list of cleaned and non-empty origin strings.
        """
        if isinstance(v, list):
            return v
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_storage_settings(self) -> "Settings":
        required = [
            "S3_ACCESS_KEY_ID",
            "S3_SECRET_ACCESS_KEY",
            "S3_EXTERNAL_URL",
            "S3_ENDPOINT_URL",
        ]
        missing = [name for name in required if getattr(self, name) is None or str(getattr(self, name)).strip() == ""]
        if missing:
            raise ValueError("Missing required S3 storage settings: " + ", ".join(missing))
        return self

    CLAMAV: ClamAVSettings = ClamAVSettings()
    QUARANTINE_BUCKET_NAME: str = ""
    QUARANTINE_S3_ACCESS_KEY_ID: str | None = None
    QUARANTINE_S3_SECRET_ACCESS_KEY: str | None = None
    QUARANTINE_S3_ENDPOINT_URL: str | None = None

    @model_validator(mode="after")
    def enforce_scanning_in_production(self) -> "Settings":
        """Fail-closed guard: malware scanning must be enabled in non-dev environments.

        Scanning can only be disabled in local development environments. All deployed
        environments (staging, testing, production, etc.) must have ClamAV enabled to
        prevent malware uploads.

        Without this guard, the service could boot with CLAMAV__ENABLED=false, in which
        case scan_bytes/scan_stream treat every upload as clean and files bypass malware
        scanning entirely. This validator refuses to start in such misconfigured states.
        """
        # Environments where scanning can be safely disabled (local dev only)
        scanning_optional_envs = {"local", "development", "dev"}

        if self.ENV not in scanning_optional_envs and not self.CLAMAV.ENABLED:
            raise ValueError(
                f"CLAMAV must be enabled in '{self.ENV}' environment. "
                f"Malware scanning can only be disabled in local development: {', '.join(sorted(scanning_optional_envs))}. "
                "Set CLAMAV__ENABLED=true or use ENV=dev for local development."
            )
        return self

    @model_validator(mode="after")
    def validate_quarantine_bucket(self) -> "Settings":
        if self.CLAMAV.ENABLED and not self.QUARANTINE_BUCKET_NAME:
            raise ValueError(
                "QUARANTINE_BUCKET_NAME must be set when CLAMAV__ENABLED=true. "
                "Without a separate quarantine bucket, virus scanning has no isolation."
            )

        if self.CLAMAV.ENABLED:
            missing: list[str] = []
            if not self.QUARANTINE_S3_ACCESS_KEY_ID:
                missing.append("QUARANTINE_S3_ACCESS_KEY_ID")
            if not self.QUARANTINE_S3_SECRET_ACCESS_KEY:
                missing.append("QUARANTINE_S3_SECRET_ACCESS_KEY")
            if not self.QUARANTINE_S3_ENDPOINT_URL:
                missing.append("QUARANTINE_S3_ENDPOINT_URL")
            if missing:
                raise ValueError(f"Missing quarantine S3 credentials when CLAMAV is enabled: {', '.join(missing)}")

            clean_endpoint = self.S3_ENDPOINT_URL.strip().rstrip("/") if self.S3_ENDPOINT_URL else ""
            quarantine_endpoint = self.QUARANTINE_S3_ENDPOINT_URL.strip().rstrip("/")
            clean_bucket = self.BUCKET_NAME.strip()
            quarantine_bucket = self.QUARANTINE_BUCKET_NAME.strip()
            if clean_endpoint == quarantine_endpoint and clean_bucket == quarantine_bucket:
                raise ValueError(
                    "QUARANTINE_BUCKET_NAME must resolve to storage separate from BUCKET_NAME when "
                    "CLAMAV__ENABLED=true. Quarantine and clean storage cannot use the same endpoint "
                    "and bucket."
                )
        return self

    TEMPORAL: TemporalSettings

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore
