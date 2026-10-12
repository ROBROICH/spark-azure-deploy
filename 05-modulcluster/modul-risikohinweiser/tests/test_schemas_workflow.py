"""Compact contract tests for workflow schemas."""

from typing import Any, get_args
from uuid import UUID

import pytest
from pydantic import ValidationError
from temporal.contracts import PFBChapter, RiskFinderOutput, RiskFinding

from src.schemas.workflow import (
    CriteriaDefinitionResponse,
    CriterionRatingItem,
    IntentionAnalysisResponse,
    QualityAnalysisRequest,
    QualityAnalysisResponse,
    QualityCheckItem,
    QualityCriteria,
    QualityCriterionDefinition,
    RiskFormulatorFinding,
    RiskFormulatorInput,
    RiskFormulatorResponse,
)

MIN_RATING = 1
DEFECT_RATING = 2
VALID_RATING = 3
MAX_RATING = 5
INVALID_LOW = 0
INVALID_QUALITY_HIGH = 6
INVALID_SEVERITY_HIGH = 11
MAX_TEXT_LENGTH = 1000
EXPECTED_CRITERIA = {
    "BESTIMMTHEIT",
    "NORM_VERANKERUNG",
    "JUR_PRAEZISION",
    "PRAEGNANZ_SUBSTANZ",
    "FUNDIERUNG",
    "ARG_SYSTEMATIK",
    "ARG_STRINGENZ",
    "ABWAEGUNGSSORGFALT",
    "WUERDIGUNGSTIEFE",
}


def criterion_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "criterion": "BESTIMMTHEIT",
        "relevance_rating": VALID_RATING,
        "fullfilment_minimal": "Minimal erfüllt.",
        "fullfilment_optimal": "Optimal erfüllt.",
        "fullfilment_negative": "Negatives Muster.",
    }
    data.update(overrides)
    return data


def quality_item_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "rating_rationale": "Kurze Bewertung.",
        "quote": "Unklarer Begriff.",
        "rating": DEFECT_RATING,
        "breached_standard_negative": "Unklarer Standard.",
    }
    data.update(overrides)
    return data


def risk_finding_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "quote": "Unklarer Begriff.",
        "description": "Die Formulierung bleibt unbestimmt.",
        "implications": "Die Passage könnte angegriffen werden.",
        "recommendation": "Es könnte eine Konkretisierung geprüft werden.",
        "severity": MAX_RATING,
    }
    data.update(overrides)
    return data


def risk_formulator_finding_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "involved_defects": [1],
        "main_defect_id": 1,
        **risk_finding_data(),
    }
    data.update(overrides)
    return data


def quality_request_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "chapter": "Kapiteltext.",
        "analysis_focus": "BESTIMMTHEIT",
        "main_part": "ENTSCHEIDUNG",
        "subpart": "Tenor",
        "purpose": "Entscheidung",
        "structure": "Liste",
        "exclusions": "Keine Begründung",
        "dependencies": "Keine",
        "fullfilment_minimal": "Minimal.",
        "fullfilment_optimal": "Optimal.",
        "fullfilment_negative": "Negativ.",
    }
    data.update(overrides)
    return data


def test_chapter_defaults_generate_uuid() -> None:
    chapter = PFBChapter(text="Kapiteltext.")
    assert isinstance(chapter.id, UUID)
    assert chapter.title is None


def test_intention_analysis_validates_main_part_and_lengths() -> None:
    response = IntentionAnalysisResponse(
        analysis_rationale="Rationale.",
        main_part="BEGRUENDUNG",
        subpart="Abwägung",
        structure="Chronologisch.",
        purpose="Begründung der Entscheidung.",
        content_focus="Naturschutz",
        exclusions="Kein Tenor.",
        dependencies="Vorangehende Sachverhaltsdarstellung.",
    )
    assert response.main_part == "BEGRUENDUNG"

    with pytest.raises(ValidationError):
        IntentionAnalysisResponse(**{**response.model_dump(), "analysis_rationale": "x" * 501})


def test_quality_criteria_literal_values_match_schema() -> None:
    assert set(get_args(QualityCriteria)) == EXPECTED_CRITERIA
    assert CriterionRatingItem(**criterion_data()).criterion == "BESTIMMTHEIT"

    with pytest.raises(ValidationError):
        CriterionRatingItem(**criterion_data(criterion="INVALID"))


@pytest.mark.parametrize("rating", [MIN_RATING, VALID_RATING, MAX_RATING])
def test_quality_ratings_accept_boundaries(rating: int) -> None:
    criterion = QualityCriterionDefinition(**criterion_data(relevance_rating=rating))
    item = QualityCheckItem(**quality_item_data(rating=rating))
    assert criterion.relevance_rating == item.rating == rating


@pytest.mark.parametrize("rating", [INVALID_LOW, INVALID_QUALITY_HIGH])
def test_quality_ratings_reject_out_of_range_values(rating: int) -> None:
    with pytest.raises(ValidationError):
        QualityCriterionDefinition(**criterion_data(relevance_rating=rating))
    with pytest.raises(ValidationError):
        QualityCheckItem(**quality_item_data(rating=rating))


def test_quality_criterion_text_fields_are_required_and_limited() -> None:
    QualityCriterionDefinition(**criterion_data(fullfilment_minimal="x" * MAX_TEXT_LENGTH))

    with pytest.raises(ValidationError):
        QualityCriterionDefinition(**criterion_data(fullfilment_minimal="x" * (MAX_TEXT_LENGTH + 1)))
    with pytest.raises(ValidationError):
        QualityCriterionDefinition(relevance_rating=VALID_RATING)


def test_quality_analysis_request_and_response_contracts() -> None:
    request = QualityAnalysisRequest(**quality_request_data())
    response = QualityAnalysisResponse(quality_check_results=[QualityCheckItem(**quality_item_data())])
    assert request.analysis_focus == "BESTIMMTHEIT"
    assert response.quality_check_results[0].breached_standard_negative

    with pytest.raises(ValidationError):
        QualityAnalysisRequest(**{key: value for key, value in quality_request_data().items() if key != "chapter"})
    with pytest.raises(ValidationError):
        QualityAnalysisResponse(quality_check_results=[{"quote": "missing fields"}])


def test_criteria_definition_response_accepts_items_and_empty_lists() -> None:
    item = CriterionRatingItem(**criterion_data())
    assert CriteriaDefinitionResponse(criterion_ratings=[item]).criterion_ratings == [item]
    assert CriteriaDefinitionResponse(criterion_ratings=[]).criterion_ratings == []


def test_risk_finding_uuid_defaults_and_severity_bounds() -> None:
    first = RiskFinding(**risk_finding_data())
    second = RiskFinding(**risk_finding_data())
    assert isinstance(first.risk_id, UUID)
    assert first.risk_id != second.risk_id

    with pytest.raises(ValidationError):
        RiskFinding(**risk_finding_data(severity=INVALID_LOW))
    with pytest.raises(ValidationError):
        RiskFinding(**risk_finding_data(severity=INVALID_SEVERITY_HIGH))


def test_risk_formulator_models_validate_nested_defects() -> None:
    item = QualityCheckItem(**quality_item_data())
    input_model = RiskFormulatorInput(chapter_text="Kapiteltext.", quality_defects={1: item})
    finding = RiskFormulatorFinding(**risk_formulator_finding_data())
    assert input_model.quality_defects[1] == item
    assert RiskFormulatorResponse(risks=[finding]).risks == [finding]
    assert RiskFinderOutput(risks=[RiskFinding(**risk_finding_data())]).risks

    with pytest.raises(ValidationError):
        RiskFormulatorFinding(**risk_formulator_finding_data(severity=INVALID_SEVERITY_HIGH))
