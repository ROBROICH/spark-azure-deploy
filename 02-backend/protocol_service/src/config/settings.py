"""Configuration — add sources via SOURCE_DB_KEYS + matching env vars."""

from __future__ import annotations

import os

from pydantic import BaseModel, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SourceDBSettings(BaseModel):
    USER: str
    PASSWORD: str
    HOST: str
    PORT: int = 5432
    NAME: str

    @property
    def url(self) -> str:
        return f"postgresql+asyncpg://{self.USER}:{self.PASSWORD}@{self.HOST}:{self.PORT}/{self.NAME}"


_SOURCE_PREFIX_MAP: dict[str, str] = {
    "project_logic": "PROJECT_LOGIC_DB_",
    "formal_completeness": "FORMAL_COMPLETENESS_DB_",
    "comment": "COMMENT_DB_",
    "supplementary": "SUPPLEMENTARY_DB_",
    "plausibility": "PLAUSIBILITY_DB_",
    "document_management": "DOCUMENT_MANAGEMENT_DB_",
    "administrative_draft": "ADMINISTRATIVE_DRAFT_DB_",
    "examination": "EXAMINATION_DB_",
    "objections_management": "OBJECTIONS_MANAGEMENT_DB_",
}

SOURCE_DB_KEYS: tuple[str, ...] = tuple(_SOURCE_PREFIX_MAP)


class Settings(BaseSettings):
    SERVICE_NAME: str = "protocol-service"
    TEMPORAL_JOB_SERVICE_URL: str
    PROTOCOL_SERVICE_CORS_ORIGINS: str | list[str] = ""
    ALLOWED_HTTP_METHODS: list[str] = ["GET", "OPTIONS"]
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_PRE_PING: bool = True
    DB_PASSWORD: str | None = None

    PROJECT_LOGIC_DB_USER: str
    PROJECT_LOGIC_DB_PASSWORD: str
    PROJECT_LOGIC_DB_HOST: str
    PROJECT_LOGIC_DB_PORT: int
    PROJECT_LOGIC_DB_NAME: str

    FORMAL_COMPLETENESS_DB_USER: str
    FORMAL_COMPLETENESS_DB_PASSWORD: str
    FORMAL_COMPLETENESS_DB_HOST: str
    FORMAL_COMPLETENESS_DB_PORT: int
    FORMAL_COMPLETENESS_DB_NAME: str

    COMMENT_DB_USER: str
    COMMENT_DB_PASSWORD: str
    COMMENT_DB_HOST: str
    COMMENT_DB_PORT: int
    COMMENT_DB_NAME: str

    SUPPLEMENTARY_DB_USER: str
    SUPPLEMENTARY_DB_PASSWORD: str
    SUPPLEMENTARY_DB_HOST: str
    SUPPLEMENTARY_DB_PORT: int
    SUPPLEMENTARY_DB_NAME: str

    PLAUSIBILITY_DB_USER: str
    PLAUSIBILITY_DB_PASSWORD: str
    PLAUSIBILITY_DB_HOST: str
    PLAUSIBILITY_DB_PORT: int
    PLAUSIBILITY_DB_NAME: str

    DOCUMENT_MANAGEMENT_DB_USER: str
    DOCUMENT_MANAGEMENT_DB_PASSWORD: str
    DOCUMENT_MANAGEMENT_DB_HOST: str
    DOCUMENT_MANAGEMENT_DB_PORT: int
    DOCUMENT_MANAGEMENT_DB_NAME: str

    ADMINISTRATIVE_DRAFT_DB_USER: str
    ADMINISTRATIVE_DRAFT_DB_PASSWORD: str
    ADMINISTRATIVE_DRAFT_DB_HOST: str
    ADMINISTRATIVE_DRAFT_DB_PORT: int
    ADMINISTRATIVE_DRAFT_DB_NAME: str

    EXAMINATION_DB_USER: str
    EXAMINATION_DB_PASSWORD: str
    EXAMINATION_DB_HOST: str
    EXAMINATION_DB_PORT: int
    EXAMINATION_DB_NAME: str

    OBJECTIONS_MANAGEMENT_DB_USER: str
    OBJECTIONS_MANAGEMENT_DB_PASSWORD: str
    OBJECTIONS_MANAGEMENT_DB_HOST: str
    OBJECTIONS_MANAGEMENT_DB_PORT: int
    OBJECTIONS_MANAGEMENT_DB_NAME: str

    @field_validator("PROTOCOL_SERVICE_CORS_ORIGINS", mode="after")
    @classmethod
    def _split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @model_validator(mode="after")
    def _apply_shared_db_password(self) -> Settings:
        if not self.DB_PASSWORD:
            return self

        for prefix in _SOURCE_PREFIX_MAP.values():
            password_key = f"{prefix}PASSWORD"
            if os.getenv(password_key) is None:
                setattr(self, password_key, self.DB_PASSWORD)

        return self

    def source_db(self, key: str) -> SourceDBSettings:
        if key not in _SOURCE_PREFIX_MAP:
            raise ValueError(f"Unknown source DB key: {key}")
        prefix = _SOURCE_PREFIX_MAP[key]
        return SourceDBSettings(
            USER=getattr(self, f"{prefix}USER"),
            PASSWORD=getattr(self, f"{prefix}PASSWORD"),
            HOST=getattr(self, f"{prefix}HOST"),
            PORT=getattr(self, f"{prefix}PORT"),
            NAME=getattr(self, f"{prefix}NAME"),
        )

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
