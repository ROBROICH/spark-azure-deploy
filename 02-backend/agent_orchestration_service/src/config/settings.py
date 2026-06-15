import json
import os

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

NODE_FETCH_BATCH_SIZE = 10


class TemporalSettings(BaseModel):
    host: str
    task_queue: str
    namespace: str = "default"
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: str = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: str = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)


class APISettings(BaseModel):
    timeout: int = 10 * 60
    diplan_base_url: str
    fpp_base_url: str
    fvp_base_url: str
    dms_base_url: str
    pls_base_url: str
    administrative_file_draft_base_url: str
    plausibility_notes_base_url: str
    examination_service_base_url: str
    objections_service_base_url: str


class DIPLANSettings(BaseModel):
    secret: dict[str, dict[str, str]] = Field(default_factory=dict)

    skipped_file_types: list[str] = [".gml"]

    @field_validator("secret", mode="before")
    @classmethod
    def parse_secret_json(cls, value: str | dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        """Parse JSON string from environment variable or file."""
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            return json.loads(value) if value else {}
        raise ValueError("Invalid secret JSON string or dictionary")


class FPPSettings(BaseModel):
    """FPP settings - single config patched by K8s per environment."""

    keycloak_token_url: str = ""
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""


class Settings(BaseSettings):
    CORS_ORIGINS: str | list[str]
    ALLOWED_HTTP_METHODS: list[str] = [
        "GET",
        "POST",
        "PATCH",
        "OPTIONS",
    ]

    SERVICE_NAME: str = "agent_orchestration"
    TEMPORAL_JOB_SERVICE_URL: str
    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)

    # Chunked uploads only work with Ceph
    USE_TRANSFER_ENCODING_CHUNKED: bool

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    temporal: TemporalSettings
    api: APISettings
    diplan: DIPLANSettings = DIPLANSettings()
    fpp: FPPSettings = FPPSettings()

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
