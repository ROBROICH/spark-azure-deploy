"""Environment settings loaded from env vars or .env files."""

from __future__ import annotations

import os

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel, EmbeddingModel, VlmModel


class Settings(BaseSettings):
    """Strict environment settings. All fields are required unless defaults are set."""

    # --- LiteLLM proxy ---
    LITELLM_BASE_URL: str = Field(min_length=1)
    LITELLM_MASTER_KEY: SecretStr = Field(min_length=1)

    DMS_BASE_URL: str = Field(min_length=1)
    VLLM_MODEL: VlmModel = Field(min_length=1)
    METADATA_MODEL_NAME: ChatModel = Field(min_length=1)
    STRUCTURE_MODEL_NAME: ChatModel = Field(min_length=1)
    STRUCTURE_NODE_MAX_NODE_CHARS: int = Field(default=128_000, ge=1)
    PAGE_INDEX_MIN_TOKEN_THRESHOLD: int = Field(default=200, ge=1)
    SCHWERPUNKTTHEMA_MODEL_NAME: ChatModel = Field(min_length=1)
    SUMMARIZATION_MODEL_NAME: ChatModel = Field(min_length=1)
    VLM_SUMMARY_MODEL_NAME: ChatModel = Field(min_length=1)
    TEMPORAL_SERVER_URL: str = Field(min_length=1)
    TEMPORAL_S3_BUCKET_NAME: str = Field(min_length=1)
    TEMPORAL_S3_ENDPOINT_URL: str = Field(min_length=1)
    TEMPORAL_S3_ACCESS_KEY_ID: SecretStr = Field(min_length=1)
    TEMPORAL_S3_SECRET_ACCESS_KEY: SecretStr = Field(min_length=1)
    TEMPORAL_S3_REGION: str = Field(min_length=1)
    OTEL_SERVICE_NAME: str = Field(min_length=1)
    OTEL_ENDPOINT: str = Field(min_length=1)
    TEMPORAL_JOB_SERVICE_URL: str = Field(min_length=1)
    UNO_HOST: str = Field(min_length=1)
    UNO_PORT: int = Field(ge=1, le=65535)
    UNO_PROTOCOL: str = Field(min_length=1)
    SINGLE_DOCUMENT_WORKFLOW_CONCURRENCY: int = Field(ge=1)
    SINGLE_DOCUMENT_EWMS_WORKFLOW_CONCURRENCY: int = Field(ge=1)

    EXTRACTION_PROVIDER: str = Field(default="docling", min_length=1)
    EXTRACTION_CHUNK_CONCURRENCY: int = Field(default=1, ge=1)
    HYBRID_EXTRACTION_DOCLING_CONCURRENCY: int = Field(default=1, ge=1)
    HYBRID_EXTRACTION_OCR_CONCURRENCY: int = Field(default=5, ge=1)

    DOCLING_HOST: str = Field(min_length=1)
    DOCLING_PORT: int = Field(ge=1, le=65535)
    DOCLING_PROTOCOL: str = Field(default="http")
    DOCLING_OCR_ENGINE: str = Field(default="easyocr")

    # Keycloak auth for docling-serve (optional, for cluster deployment)
    KEYCLOAK_CLIENT_ID: str = Field(default="")
    KEYCLOAK_CLIENT_SECRET: SecretStr = Field(default=SecretStr(""))
    KEYCLOAK_TOKEN_URL: str = Field(default="")

    QDRANT_BASE_URL: str = Field(min_length=1)
    QDRANT_API_KEY: SecretStr = Field(default=SecretStr(""))
    QDRANT_DENSE_VECTOR_SIZE: int = Field(ge=1, le=8192)
    QDRANT_COLLECTION_NAME: str = Field(default="data", min_length=1)
    EMBEDDING_MODEL: EmbeddingModel = Field(min_length=1)

    # Injeciton Model
    INJECTION_LLM_MODEL: str = Field(min_length=1)
    INJECTION_MODEL_TOKEN: str = Field(min_length=1)
    INJECTION_MODEL_URL: str = Field(min_length=1)
    INJECTION_LLM_SCAN_ENABLED: bool = Field(default=True)

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
    )


ENV = Settings()
