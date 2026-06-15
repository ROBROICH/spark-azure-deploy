from pydantic import BaseModel

from src.config.env import ENV


class EmbeddingConfig(BaseModel):
    """Settings for the text embedding model."""

    MODEL: str = ENV.LLM.EMBEDDING_MODEL


class MatchingConfig(BaseModel):
    """Tuning parameters for document ranking and fusion."""

    DEFAULT_TOP_K: int = 4
    RRF_K: int = 60
    LIMIT: int = 1000


class PageIndexSVMConfig(BaseModel):
    """Settings for the two-stage PageIndex SVM pipeline."""

    CONSENSUS_RUNS: int = 3
    CONSENSUS_THRESHOLD: int = 2
    CONSENSUS_TEMPERATURE: float = 0.3
    STAGE2_TEMPERATURE: float = 0.7
    MODEL_STAGE1: str = ENV.LLM.PAGEINDEX_SVM_MODEL_STAGE1
    MODEL_STAGE1_MAX_TOKENS: int | None = 16000
    MODEL_STAGE1_REASONING_EFFORT: str | None = None
    MAX_PARSE_ATTEMPTS_STAGE1: int = 5
    STAGE1_MAX_INPUT_TOKENS: int = ENV.LLM.PAGEINDEX_SVM_STAGE1_MAX_INPUT_TOKENS
    MODEL_STAGE2: str = ENV.LLM.PAGEINDEX_SVM_MODEL_STAGE2
    MODEL_STAGE2_MAX_TOKENS: int | None = 16000
    MODEL_STAGE2_REASONING_EFFORT: str | None = None
    TRUNCATION_ENCODING: str = "cl100k_base"
    STAGE2_MAX_BATCH_TOKENS: int = 10000
    STAGE2_PROMPT_OVERHEAD: int = 2000
    STAGE2_MAX_INPUT_TOKENS: int = ENV.LLM.PAGEINDEX_SVM_STAGE2_MAX_INPUT_TOKENS
    MAX_CHUNKS_PER_BATCH: int = 5
    STAGE2_RESEARCH_REPORT_MAX_TOKENS: int = 2000


class DBResearchConfig(BaseModel):
    """Settings for the DB-backed research synthesis workflow."""

    MODEL: str = ENV.LLM.DB_RESEARCH_MODEL
    MAX_TOKENS: int | None = 16000
    REASONING_EFFORT: str | None = None
    DKE_TOP_K: int = 5
    UT_TOP_K: int = 10
    UT_MAX_UNIQUE_CASES: int = 5
    DKE_CHARS_PER_CHUNK: int = 600
    UT_CHARS_PER_CASE: int = 800


class WorkflowOrchestratorConfig(BaseModel):
    """Concurrency limits for child workflow execution."""

    MAX_CONCURRENT_SATZ_CHILDREN: int | None = 2
    MAX_CONCURRENT_PAGEINDEX_SVM: int | None = 2


class Config:
    """Application tuneables live here. ENV access belongs in env.py."""

    EMBEDDING = EmbeddingConfig()
    MATCHING = MatchingConfig()
    PAGEINDEX_SVM = PageIndexSVMConfig()
    DB_RESEARCH = DBResearchConfig()
    WORKFLOW_ORCHESTRATOR = WorkflowOrchestratorConfig()


CONFIG = Config()
