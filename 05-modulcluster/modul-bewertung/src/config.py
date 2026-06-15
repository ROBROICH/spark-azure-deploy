"""Internal app config — stable behavior defaults, not deploy-varying."""

from datetime import timedelta

from pydantic import BaseModel
from temporalio.common import RetryPolicy


class MicroBuilderConfig(BaseModel):
    """Configuration for the MicroBuilder stage."""
    # Anzahl Fundstellen pro LLM-Batch bei der Micro-Summary-Erstellung
    BATCH_SIZE: int = 20
    # Maximale Zeichenanzahl für die Kernaussage im Fallback-Modus
    FALLBACK_MAX_CHARS: int = 200


class PlannerConfig(BaseModel):
    """Configuration for the Planner stage."""
    # Lokale Retry-Versuche für Plan-Validierung, bevor an CHILD_WORKFLOW_RETRY_POLICY eskaliert wird
    VALIDATION_MAX_ATTEMPTS: int = 2


class DetailPlannerConfig(BaseModel):
    """Configuration for the DetailPlanner stage."""
    # Anzahl Micros pro Batch für den DetailPlanner
    BATCH_SIZE: int = 50
    # Ab dieser Micro-Anzahl wird der DetailPlanner (Sampling + Grob-/Detailplan) aktiviert
    MAX_PLANNER_MICROS: int = 600
    # Lokale Retry-Versuche für Batch-Validierung, bevor an CHILD_WORKFLOW_RETRY_POLICY eskaliert wird
    VALIDATION_MAX_ATTEMPTS: int = 3


class WriterConfig(BaseModel):
    """Configuration for the Writer stage."""
    # Lokale Retry-Versuche für Kapitel-Validierung, bevor an CHILD_WORKFLOW_RETRY_POLICY eskaliert wird
    VALIDATION_MAX_ATTEMPTS: int = 3


class QualityReviewerConfig(BaseModel):
    """Configuration for the QualityReviewer stage."""
    # Lokale Retry-Versuche, bevor auf den Original-Entwurf zurückgefallen wird
    MAX_ATTEMPTS: int = 2


class ApplicabilityConfig(BaseModel):
    """Configuration for the Applicability pre-check stage."""
    # Ab dieser Micro-Anzahl wird stride-basiertes Sampling aktiviert
    MAX_MICROS: int = 600


class Config(BaseModel):
    """Top-level application configuration."""
    MICRO_BUILDER: MicroBuilderConfig = MicroBuilderConfig()
    PLANNER: PlannerConfig = PlannerConfig()
    DETAIL_PLANNER: DetailPlannerConfig = DetailPlannerConfig()
    WRITER: WriterConfig = WriterConfig()
    QUALITY_REVIEWER: QualityReviewerConfig = QualityReviewerConfig()
    APPLICABILITY: ApplicabilityConfig = ApplicabilityConfig()
    # Mindestanzahl Fundstellen, ab der eine Bewertung durchgeführt wird
    MIN_FUNDSTELLEN: int = 5


config = Config()


# Retry policy for child workflows (e.g. Planner) that get retried on
# LLM validation errors (ApplicationError non_retryable=False).
CHILD_WORKFLOW_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=20,
)
