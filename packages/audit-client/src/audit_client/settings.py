import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class AuditClientSettings(BaseSettings):
    """Settings for audit-client. Header names default to Envoy's ingress
    convention; override via env vars when infra renames them."""

    HEADER_REQUEST_START_TIME: str = "X-Request-Starttime"
    HEADER_REQUEST_ID: str = "X-Request-Id"

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        extra="ignore",
    )


settings = AuditClientSettings()
