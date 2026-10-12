"""Internal defaults that do not vary between deploys; environment settings live in env.py."""

import os
from datetime import timedelta

from pydantic import BaseModel, Field
from temporalio.common import RetryPolicy


class RiskScreeningParamsConfig(BaseModel):
    """Configuration parameters for the risk screening workflow."""

    K_TOTAL_COMPARISON_CLAIMS: int = 7
    RATING_THRESHOLD: int = 65
    K_LOCAL_COMPARISON_CLAIMS: int = 1
    K_ERLAEUTERUNGSBERICHT_COMPARISON_CLAIMS: int = 1
    SCORE_LOWER_THRESHOLD: float = 0.5
    SCORE_UPPER_THRESHOLD: float = 0.95
    QDRANT_QUERY_BATCH_SIZE: int = 40
    SCREENING_CLAIMS_PER_BATCH: int = 5
    REASONING_EFFORT: str = "medium"


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
    REASONING_EFFORT: str = "medium"


class ClusteringParamsConfig(BaseModel):
    """Graph clustering of verified inconsistency pairs.

    Clusters are never truncated (that silently dropped confirmed edges); they are bounded only at prompt building.
    """

    SIMILARITY_THRESHOLD: float = Field(
        0.80,
        ge=0.0,
        le=1.0,
        description="Minimum cosine similarity for merging two inconsistency pairs into one cluster.",
    )


class PrefilterParamsConfig(BaseModel):
    """Deterministic, LLM-free pre-filter in front of the context checker."""

    PAGE_FETCH_BATCH_SIZE: int = 200


class NoteVerifierParamsConfig(BaseModel):
    """Verification — deterministic evidence + adversarial LLM verifier per note."""

    BASE_VOTES: int = 3
    BASE_REASONING_EFFORT: str = "medium"
    ESCALATION_VOTES: int = 2
    ESCALATION_REASONING_EFFORT: str = "high"
    ESCALATION_WEIGHT: float = 2.0
    ESCALATION_MIN_BASE_SUM: float = Field(
        1.5, description="Weighted 'echt' sum of the base votes that triggers the second-opinion veto pass."
    )
    VOTE_SPREAD: float = Field(72.0, description="score = score_det + (weighted vote share - 0.5) * VOTE_SPREAD")
    CAP_WITHOUT_REFERENT_EVIDENCE: float = 75.0
    CAP_HARD_NEGATIVE: float = 40.0
    MIN_SCORE_B: float | None = Field(
        60.0,
        description=(
            "Run the verifier only for notes whose rubric score reaches this value; below it the "
            "verification score is the deterministic score alone. None = verifier for every note."
        ),
    )
    MAX_LOCATIONS_IN_PROMPT: int = 6
    MAX_CHUNK_TEXT_CHARS: int = 2500
    MAX_PROMPT_CHARS: int = 22000
    MAX_CHUNK_TEXT_STORED_CHARS: int = 4000
    MAX_PAGE_TEXT_STORED_CHARS: int = Field(
        6000, description="Page text stored per location (window around the excerpt); bounds the activity payload."
    )
    NEIGHBOR_TEXT_CHARS: int = 800


class RubricParamsConfig(BaseModel):
    """Rubric — extractive rubric with page context + deterministic pairwise scoring."""

    REASONING_EFFORT: str = "low"
    MAX_LOCATIONS_IN_PROMPT: int = 4
    MAX_PAGE_CHARS: int = 2600
    MAX_EXCERPT_CHARS: int = 400
    SELF_CONSISTENCY_THRESHOLD: int = Field(
        76, description="Second rubric call (chunk context instead of page context) only from this score on."
    )
    SCORE_TOP_NUMERIC: int = 95
    SCORE_TOP_QUALITATIVE: int = 86
    SCORE_CAP_NON_TOP: int = 74
    ATTRIBUTE_MIN_SIMILARITY: float = 0.34
    MAX_VALIDATION_ATTEMPTS: int = Field(
        3,
        description="LLM retries for a schema-violating rubric answer; then the rubric score is 0 with a reason.",
    )


class ConsolidationParamsConfig(BaseModel):
    """Deterministic duplicate consolidation of notes into delivered contradictions."""

    VALUE_MIN_SIMILARITY: float = Field(0.5, description="Token similarity for non-numeric values to count as equal.")


class ExtractionParamsConfig(BaseModel):
    """Evidence captured at claim extraction (changes need a re-extraction)."""

    OBJECT_ID_TEXT_CHARS: int = 2500


class CandidatesParamsConfig(BaseModel):
    """Deterministic candidate sources next to the risk screener.

    Detector and overflow hits bypass the LLM screener; cross-reference candidates run through it.
    """

    OVERFLOW_MIN_OVERLAP: float = Field(0.6, description="Token overlap two overflow statements must share.")
    CROSS_REFERENCE_K: int = Field(
        3, description="Neighbours per citing claim inside the referenced document (no upper window)."
    )
    CROSS_REFERENCE_SCORE_LOWER: float = 0.3
    MIN_CLAIM_OVERLAP: float = Field(0.3, description="Token overlap a claim needs to represent a detector sentence.")


class QdrantBuilderParamsConfig(BaseModel):
    """Configuration parameters for the Qdrant builder workflow."""

    DEFAULT_ACTIVITY_RETRIES: int = 5
    PROCESS_AND_UPLOAD_BATCH_SIZE: int = 50
    CHUNK_MIN_LENGTH: int = 50
    EXTRACT_TABLES: bool = Field(False, description="Also extract claims from table chunks.")
    TABLE_MAX_CHARS: int = 80_000
    EXTRACTION_CHUNKS_PER_BATCH: int = 10
    EXTRACTION_MAX_CHARS_PER_BATCH: int = 100_000
    EXTRACTION_REASONING_EFFORT: str = "medium"


class TemporalConfig(BaseModel):
    """Runtime tuning for worker/activity execution."""

    MAX_PENDING_ACTIVITIES: int = 900
    MAX_CONCURRENT_CHILD_WORKFLOWS: int = 100
    CHILD_WORKFLOW_BATCH_SIZE: int = 50
    WORKFLOW_TASK_TIMEOUT_SECONDS: int = 60
    ACTIVITY_TIMEOUT_SECONDS: int = 600
    UPLOAD_ACTIVITY_TIMEOUT_SECONDS: int = 600
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


class QdrantConfig(BaseModel):
    """Qdrant-specific configuration parameters."""

    # Overridable so several environments can share one Qdrant instance.
    CLAIM_COLLECTION_NAME: str = os.getenv("QDRANT_CLAIM_COLLECTION_NAME", "plausibility")
    DATA_COLLECTION_NAME: str = os.getenv("QDRANT_DATA_COLLECTION_NAME", "data")
    INDEX_KEYWORDS: list[str] = ["project_id", "document_id", "chunk_id", "claim_metadata.claim_id"]
    INDEX_TEXT: list[str] = ["title", "claim_metadata.claim_content"]
    INDEX_BOOLS: list[str] = ["erlauterungsbericht", "superseded"]


class Config:
    """Global configuration object with all default settings."""

    # Qdrant builder workflow settings
    QDRANT_BUILDER = QdrantBuilderParamsConfig()
    EMBEDDING = EmbeddingConfig()

    # Check logic workflow settings
    RISK_SCREENING = RiskScreeningParamsConfig()
    CONTEXT_CHECKING = ContextCheckingParamsConfig()
    PREFILTER = PrefilterParamsConfig()
    EXTRACTION = ExtractionParamsConfig()

    CANDIDATES = CandidatesParamsConfig()
    CLUSTERING = ClusteringParamsConfig()
    NOTE_VERIFIER = NoteVerifierParamsConfig()
    RUBRIC = RubricParamsConfig()
    CONSOLIDATION = ConsolidationParamsConfig()

    # Orchestration/service settings
    TEMPORAL = TemporalConfig()
    DMS = DMSConfig()
    QDRANT = QdrantConfig()


config = Config()
