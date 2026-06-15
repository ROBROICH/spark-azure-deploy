"""
Application configuration — internal defaults that do not vary between deploys.
Environment-specific settings live in env.py.
"""

from datetime import timedelta

from pydantic import BaseModel, Field
from temporalio.common import RetryPolicy


class RiskScreeningParamsConfig(BaseModel):
    """Configuration parameters for the risk screening workflow."""

    K_TOTAL_COMPARISON_CLAIMS: int = 7
    RATING_THRESHOLD: int = 65
    K_LOCAL_COMPARISON_CLAIMS: int = 1
    K_ERLAEUTERUNGSBERICHT_COMPARISON_CLAIMS: int = 3
    SCORE_LOWER_THRESHOLD: float = 0.5
    SCORE_UPPER_THRESHOLD: float = 0.95
    QDRANT_QUERY_BATCH_SIZE: int = 40
    SCREENING_CLAIMS_PER_BATCH: int = 5


class ContextCheckingParamsConfig(BaseModel):
    """Configuration parameters for the context checking workflow."""

    MAX_PREVIOUS_CHUNKS: int = 10
    MAX_PREVIOUS_TEXT_CHARS: int = 7000
    MAX_FOLLOWUP_CHUNKS: int = 1
    MAX_FOLLOWUP_TEXT_CHARS: int = 1000
    PREVIOUS_TEXT_TRUNCATE_RATIO: float = 0.2
    RATING_THRESHOLD: int = 50
    CONTEXT_BATCH_SIZE: int = 200
    LLM_SUMMARY_BEGIN_MARKER: str = "<<<BEGIN_LLM_SUMMARY_NON_VERBATIM>>>"
    LLM_SUMMARY_END_MARKER: str = "<<<END_LLM_SUMMARY_NON_VERBATIM>>>"


class SummarizingParamsConfig(BaseModel):
    """Configuration parameters for the summarizing workflow."""

    MAX_EDGES_PER_CLUSTER: int = 5
    SIMILARITY_THRESHOLD: float = Field(
        0.80,
        ge=0.0,
        le=1.0,
        description="Minimum cosine similarity for merging two inconsistency pairs into one cluster.",
    )


class QdrantBuilderParamsConfig(BaseModel):
    """Configuration parameters for the Qdrant builder workflow."""

    DEFAULT_ACTIVITY_RETRIES: int = 5
    ACTIVITY_TIMEOUT_SECONDS: int = 10000
    PROCESS_AND_UPLOAD_BATCH_SIZE: int = 50
    CHUNK_MIN_LENGTH: int = 50
    TABLE_MAX_CHARS: int = 80_000
    EXTRACTION_CHUNKS_PER_BATCH: int = 10
    EXTRACTION_MAX_CHARS_PER_BATCH: int = 100_000


class TemporalConfig(BaseModel):
    """Runtime tuning for worker/activity execution."""

    MAX_PENDING_ACTIVITIES: int = 900
    MAX_CONCURRENT_CHILD_WORKFLOWS: int = 100
    CHILD_WORKFLOW_BATCH_SIZE: int = 50
    LLM_MAX_CONCURRENT_ACTIVITIES: int = 1500
    ACTIVITY_TIMEOUT_SECONDS: int = 600
    UPLOAD_ACTIVITY_TIMEOUT_SECONDS: int = 600
    LLM_ACTIVITY_TIMEOUT_SECONDS: int = 1800
    ACTIVITY_MAX_RETRIES: int = 20
    LLM_RETRY_POLICY: RetryPolicy = RetryPolicy(
        maximum_attempts=500,
        initial_interval=timedelta(seconds=10),
        backoff_coefficient=2,
        maximum_interval=timedelta(seconds=30),
    )


class DMSConfig(BaseModel):
    """DMS pagination safeguards."""

    PAGE_SIZE: int = 500
    MAX_PAGES: int = 200


class EmbeddingConfig(BaseModel):
    """Embedding/vector storage settings."""

    UPLOAD_BATCH_SIZE: int = 1000
    TIMEOUT_SECONDS: int = 180


class QdrantConfig(BaseModel):
    """Qdrant-specific configuration parameters."""

    CLAIM_COLLECTION_NAME: str = "plausibility"
    DATA_COLLECTION_NAME: str = "data"
    INDEX_KEYWORDS: list[str] = ["project_id", "document_id", "chunk_id", "claim_metadata.claim_id"]
    INDEX_TEXT: list[str] = ["title", "claim_metadata.claim_content"]
    INDEX_BOOLS: list[str] = ["erlauterungsbericht"]


class Config:
    """Global configuration object with all default settings."""

    # Qdrant builder workflow settings
    QDRANT_BUILDER = QdrantBuilderParamsConfig()
    EMBEDDING = EmbeddingConfig()

    # Check logic workflow settings
    RISK_SCREENING = RiskScreeningParamsConfig()
    CONTEXT_CHECKING = ContextCheckingParamsConfig()
    SUMMARIZING = SummarizingParamsConfig()

    # Orchestration/service settings
    TEMPORAL = TemporalConfig()
    DMS = DMSConfig()
    QDRANT = QdrantConfig()


config = Config()
