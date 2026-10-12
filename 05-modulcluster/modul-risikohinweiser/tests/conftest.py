"""Shared fixtures for modul-risikohinweiser tests."""

import os
from uuid import UUID

import pytest
from temporal.contracts import PFBChapter

from src.schemas.workflow import (
    CriteriaDefinitionResponse,
    CriterionRatingItem,
    IntentionAnalysisResponse,
    QualityAnalysisResponse,
    QualityCheckItem,
    RiskFormulatorFinding,
)

_ENV_DEFAULTS = {
    "LITELLM_MODEL": "mistral-small-2506",
    "TEMPORAL_HOST": "localhost:7233",
    "TEMPORAL_S3_BUCKET_NAME": "test",
    "TEMPORAL_S3_ENDPOINT_URL": "http://localhost:9000",
    "TEMPORAL_S3_ACCESS_KEY_ID": "test",
    "TEMPORAL_S3_SECRET_ACCESS_KEY": "test",
    "TEMPORAL_S3_REGION": "eu-central-1",
    "OTEL_SERVICE_NAME": "modul-risikohinweiser-test",
    "OTEL_ENDPOINT": "http://localhost:4317",
    "TEMPORAL_JOB_SERVICE_URL": "http://localhost:18011",
}

for key, value in _ENV_DEFAULTS.items():
    os.environ.setdefault(key, value)


CHAPTER_ID = UUID("550e8400-e29b-41d4-a716-446655440000")
RELEVANT_RATING = 4
IRRELEVANT_RATING = 2
DEFECT_RATING = 2
PASSING_RATING = 4
HIGH_SEVERITY = 7


@pytest.fixture
def sample_chapter() -> PFBChapter:
    return PFBChapter(
        id=CHAPTER_ID,
        title="Begründung der Planfeststellung",
        text=("Die Planfeststellung wird hiermit erteilt. Die Belange des Naturschutzes wurden berücksichtigt."),
    )


@pytest.fixture
def sample_intention_response() -> IntentionAnalysisResponse:
    return IntentionAnalysisResponse(
        analysis_rationale="Das Kapitel dient der Entscheidung.",
        main_part="ENTSCHEIDUNG",
        subpart="Tenor",
        structure="Entscheidung mit kurzer Begründung.",
        purpose="Erteilung der Planfeststellung",
        content_focus="Entscheidungserlass",
        exclusions="Keine Einwendungsprüfung",
        dependencies="Baut auf der Abwägung auf",
    )


def criterion_rating(criterion: str, rating: int) -> CriterionRatingItem:
    return CriterionRatingItem(
        criterion=criterion,
        relevance_rating=rating,
        fullfilment_minimal=f"{criterion} minimal.",
        fullfilment_optimal=f"{criterion} optimal.",
        fullfilment_negative=f"{criterion} negativ.",
    )


@pytest.fixture
def mixed_criteria_response() -> CriteriaDefinitionResponse:
    return CriteriaDefinitionResponse(
        criterion_ratings=[
            criterion_rating("BESTIMMTHEIT", RELEVANT_RATING),
            criterion_rating("NORM_VERANKERUNG", RELEVANT_RATING),
            criterion_rating("FUNDIERUNG", IRRELEVANT_RATING),
        ]
    )


def quality_item(rating: int, quote: str = "Unklarer Begriff.") -> QualityCheckItem:
    return QualityCheckItem(
        quote=quote,
        rating=rating,
        rating_rationale="Bewertung anhand des Kapiteltexts.",
        breached_standard_negative="" if rating >= PASSING_RATING else "Unklarer Standard.",
    )


@pytest.fixture
def defect_quality_response() -> QualityAnalysisResponse:
    return QualityAnalysisResponse(quality_check_results=[quality_item(DEFECT_RATING)])


@pytest.fixture
def passing_quality_response() -> QualityAnalysisResponse:
    return QualityAnalysisResponse(quality_check_results=[quality_item(PASSING_RATING)])


@pytest.fixture
def sample_risk_formulator_finding() -> RiskFormulatorFinding:
    return RiskFormulatorFinding(
        involved_defects=[1],
        main_defect_id=1,
        quote="Unklarer Begriff.",
        description="Die Formulierung bleibt unbestimmt.",
        implications="Die Passage könnte argumentativen Spielraum eröffnen.",
        recommendation="Es könnte geprüft werden, ob der Begriff konkretisiert wird.",
        severity=HIGH_SEVERITY,
    )
