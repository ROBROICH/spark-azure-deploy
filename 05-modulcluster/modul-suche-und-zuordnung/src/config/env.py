import os

from pydantic import AnyHttpUrl, BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel, EmbeddingModel
from temporal.connection_config import TemporalConfig


class FcsConfig(BaseModel):
    """Connection settings for the Formal Completeness Check (FCS) service."""

    BASE_URL: str = "http://localhost:8003"
    TIMEOUT: float = 60.0


class QdrantConfig(BaseModel):
    """Connection settings for the Qdrant vector database."""

    HOST: str
    PORT: int
    COLLECTION: str


class LawDatabaseConfig(BaseModel):
    """Base URLs for the DKE and Urteile law database endpoints."""

    DKE_BASE_URL: AnyHttpUrl
    UT_BASE_URL: AnyHttpUrl


class LLMConfig(BaseModel):
    """LLM model names, configurable per environment."""

    EMBEDDING_MODEL: EmbeddingModel = Field(min_length=1)
    PAGEINDEX_SVM_MODEL_STAGE1: ChatModel = Field(min_length=1)
    PAGEINDEX_SVM_MODEL_STAGE2: ChatModel = Field(min_length=1)
    PAGEINDEX_SVM_STAGE1_MAX_INPUT_TOKENS: int = 70000
    PAGEINDEX_SVM_STAGE2_MAX_INPUT_TOKENS: int = 70000
    DB_RESEARCH_MODEL: ChatModel = Field(min_length=1)


class Settings(BaseSettings):
    """Application-wide settings loaded from environment variables."""

    FCS: FcsConfig = FcsConfig()
    LAW_DATABASE: LawDatabaseConfig
    LLM: LLMConfig
    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str
    QDRANT: QdrantConfig
    OTEL_SERVICE_NAME: str
    OTEL_ENDPOINT: str

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
    )


ENV = Settings()
