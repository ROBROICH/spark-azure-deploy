"""Environment configuration and constants."""

import os

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from temporal.activities.models import ChatModel
from temporal.connection_config import TemporalConfig


class LawDatabaseConfig(BaseModel):
    """Configuration for law database API endpoints."""

    DOCUMENTS_URL: str = Field(..., description="http://localhost:18020/documents/")
    NORMS_SEARCH_URL: str = Field(..., description="http://localhost:18020/norms/search")
    ABSATZ_JURABK_URL: str = Field(..., description="http://localhost:18020/absatz/{jurabk}")
    DOCUMENTS_SEARCH_TERM_URL: str = Field(..., description="http://localhost:18020/documents/search/{search_term}")
    DOCUMENTS_JURABK_URL: str = Field(..., description="http://localhost:18020/documents/{jurabk}")
    LEGALDEFINITIONEN_JURABK_URL: str = Field(..., description="http://localhost:18020/legaldefinitionen/{jurabk}")
    TECHNISCHE_NORMEN_DOKUMENT_URL: str = Field(..., description="http://localhost:18020/technische-normen/{dokument}")
    QUERY_TOP_K_DR_URL: str = Field(..., description="http://localhost:18021/query_top_k")
    QUERY_K_RESULTS_UT_URL: str = Field(..., description="http://localhost:18022/query_k_results")
    QUERY_CHUNKS_UT_URL: str = Field(..., description="http://localhost:18022/chunks")


class LLMConfig(BaseModel):
    """Configuration for LLM models."""

    LARGE_LLM: ChatModel
    MEDIUM_LLM: ChatModel
    SMALL_LLM: ChatModel


class WiktionaryConfig(BaseModel):
    """Configuration for the Wiktionary API integration."""

    ENABLED: bool


class Settings(BaseSettings):
    """Application-wide settings loaded from environment variables."""

    TEMPORAL: TemporalConfig
    TEMPORAL_JOB_SERVICE_URL: str
    OTEL_SERVICE_NAME: str
    OTEL_ENDPOINT: str
    LAW_DATABASE: LawDatabaseConfig
    MODELS: LLMConfig
    WIKTIONARY: WiktionaryConfig
    model_config = SettingsConfigDict(  # pyrefly: ignore
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="_",
        env_nested_max_split=1,
        extra="ignore",
    )


ENV = Settings()  # pyrefly: ignore
