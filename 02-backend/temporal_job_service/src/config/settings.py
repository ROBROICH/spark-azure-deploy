"""Configuration settings for the microservice."""

import os

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Higher values indicate more resource-intensive workflows.
DEFAULT_WORKFLOW_COMPLEXITY: dict[str, float] = {
    # ── Top-Level Entry Points ──
    "FVPWorkflow": 5900,
    "bewertung": 130,
    "suche_zuordnung_norm": 50,
    "BatchMVPWorkflow": 800,
    # ── Inhaltsextraktion ──
    "process-documents-workflow": 900,
    "single-document-workflow": 45,
    "chunk-metadata-workflow": 15,
    # ── Formale Prüfung ──
    "InhaltsverzeichnisMatchingWorkflow": 121,
    "InhaltsverzeichnisFinderWorkflow": 121,
    "LLMMatchingWorkflow": 51,
    "llm-matching-single-document": 2.5,
    # ── Plausibilitätsprüfung ──
    "PlausibilityMainOrchestratorWorkflow": 4000,
    "ClaimExtractionOrchestratorWorkflow": 4000,
    "ClaimExtractionSingleDocumentWorkflow": 200,
    "ClaimExtractionBatchWorkflow": 5,
    "PlausibilityCheckOrchestratorWorkflow": 3400,
    "PlausibilityCheckSingleDocumentWorkflow": 170,
    "PlausibilityScreeningContextBatchWorkflow": 13,
    # ── Bewertung ──
    "ProcessBewertungenWorkflow": 80,
    "bewertungs_workflow": 16,
    "MicroBuilderWorkflow": 16,
    "PlannerWorkflow": 13,
    "WriterWorkflow": 11,
    # ── Suche & Zuordnung ──
    "satz_orchestrator": 300,
    "tbm_db_research": 2,
    "match_single_tbm": 15,
    "pageindex_svm": 8,
    # ── MVP / Rechtsmethodik ──
    "MVPWorkflow": 1400,
    "RechtsmethodikWorkflow": 800,
}


class TemporalSettings(BaseModel):
    host: str
    task_queue: str
    namespace: str = "default"
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: str = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: str = Field(min_length=1)
    S3_REGION: str = Field(min_length=1)
    S3_ARCHIVAL_BUCKET_NAME: str = Field(min_length=1)


class DBSettings(BaseModel):
    user: str
    password: str
    host: str
    name: str
    port: int = 5432

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"


class Settings(BaseSettings):
    """Application configuration settings loaded from environment variables."""

    SERVICE_NAME: str = "temporal-job-service"

    OTEL_SERVICE_NAME: str = "temporal-job-service"
    OTEL_ENDPOINT: str = "http://localhost:4317"

    TEMPORAL_ADDRESS: str = Field(default="localhost:7233", description="The address of the temporal service")

    TEMPORAL_NAMESPACE: str = Field(
        default="default",
        description="The namespace with which to register Workflow and Activity tasks within Temporal. Namespaces are used to isolate groups of workflows and activities within the Temporal service.",
    )

    MAX_SYSTEM_COMPLEXITY: float = Field(
        default=sum(DEFAULT_WORKFLOW_COMPLEXITY.values()),
        description="Maximum total complexity the system can handle. Load percentage is calculated against this value.",
    )

    WORKFLOW_COMPLEXITY: dict[str, float] = Field(
        default=DEFAULT_WORKFLOW_COMPLEXITY,
        description="Complexity weight per workflow type. Override via JSON env var.",
    )

    DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT: int = Field(
        default=3,
        description="Complexity weight for workflow types not explicitly configured.",
    )

    RECONCILER_ENABLED: bool = True
    RECONCILER_INTERVAL_SECONDS: int = 120
    RECONCILER_BATCH_SIZE: int = 500
    RECONCILER_BACKFILL_WINDOW_MINUTES: int = 30
    RECONCILER_PENDING_TIMEOUT_MINUTES: int = 24 * 60

    ARCHIVAL_ENABLED: bool = True
    ARCHIVAL_CRON: str = Field(
        default="0 0 * * 0",
        description="Cron expression for the weekly history archival workflow (default: Sunday 00:00 UTC).",
    )
    ARCHIVAL_BATCH_SIZE: int = Field(
        default=100,
        description="Maximum unarchived workflows fetched per archival activity batch.",
    )
    ARCHIVAL_ACTIVITY_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="schedule_to_close timeout for the per-workflow archival activity.",
    )
    ARCHIVAL_S3_PREFIX: str = Field(
        default="temporal-history",
        description="S3 key prefix for archived Temporal workflow histories.",
    )
    ARCHIVAL_ENCRYPTION_KEY: str | None = Field(
        default=None,
        description=(
            "Optional Fernet key (urlsafe base64-encoded 32 bytes) used to encrypt "
            "archived workflow histories before they are written to the bucket. "
            "Generate one with `Fernet.generate_key()`. When unset, archives are "
            "stored unencrypted."
        ),
    )
    ARCHIVAL_WORKFLOW_ID: str = Field(
        default="WeeklyArchivalWorkflow",
        description="Schedule and workflow id used for the recurring archival run.",
    )

    temporal: TemporalSettings
    db: DBSettings

    model_config = SettingsConfigDict(
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
