"""Workflow orchestration tests for RiskCheckerWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.contracts import PFBChapter, RiskFinderOutput

from src.schemas.workflow import (
    CriteriaDefinitionResponse,
    IntentionAnalysisResponse,
    QualityAnalysisResponse,
    QualityCheckItem,
    RiskFormulatorFinding,
    RiskFormulatorInput,
)
from src.workflows.risk_checker import RiskCheckerWorkflow
from tests.conftest import DEFECT_RATING, PASSING_RATING, criterion_rating, quality_item

EXPECTED_RELEVANT_CRITERIA = 2
FIRST_DEFECT_ID = 1
SECOND_DEFECT_ID = 2


def _response_with_criteria(*ratings: tuple[str, int]) -> CriteriaDefinitionResponse:
    return CriteriaDefinitionResponse(
        criterion_ratings=[criterion_rating(criterion, rating) for criterion, rating in ratings]
    )


def _quality_response(*items: QualityCheckItem) -> QualityAnalysisResponse:
    return QualityAnalysisResponse(quality_check_results=list(items))


def _risk_finding() -> RiskFormulatorFinding:
    return RiskFormulatorFinding(
        involved_defects=[FIRST_DEFECT_ID],
        main_defect_id=FIRST_DEFECT_ID,
        quote="Unklarer Begriff.",
        description="Die Formulierung bleibt unbestimmt.",
        implications="Die Passage könnte angegriffen werden.",
        recommendation="Es könnte eine Konkretisierung geprüft werden.",
        severity=7,
    )


def _workflow_patches(
    intention: IntentionAnalysisResponse,
    criteria: CriteriaDefinitionResponse,
    quality_side_effect: list[QualityAnalysisResponse],
    risks: list[RiskFormulatorFinding] | None = None,
) -> tuple[AsyncMock, AsyncMock, AsyncMock]:
    analyze_intention = AsyncMock(return_value=intention)
    rate_criteria = AsyncMock(return_value=criteria)
    analyze_quality = AsyncMock(side_effect=quality_side_effect)
    formulate_risks = AsyncMock(return_value=risks or [])
    return analyze_intention, rate_criteria, analyze_quality, formulate_risks


@pytest.mark.asyncio
async def test_run_executes_pipeline_and_formats_risks(
    sample_chapter: PFBChapter,
    sample_intention_response: IntentionAnalysisResponse,
    defect_quality_response: QualityAnalysisResponse,
) -> None:
    criteria = _response_with_criteria(("BESTIMMTHEIT", PASSING_RATING))
    mocks = _workflow_patches(sample_intention_response, criteria, [defect_quality_response], [_risk_finding()])
    analyze_intention, rate_criteria, analyze_quality, formulate_risks = mocks

    with (
        patch("src.workflows.risk_checker.analyze_intention", analyze_intention),
        patch("src.workflows.risk_checker.rate_criteria_relevance", rate_criteria),
        patch("src.workflows.risk_checker.analyze_quality", analyze_quality),
        patch("src.workflows.risk_checker.formulate_risks", formulate_risks),
    ):
        result = await RiskCheckerWorkflow().run(sample_chapter)

    assert isinstance(result, RiskFinderOutput)
    assert result.risks[0].chapter_id == sample_chapter.id
    assert result.risks[0].quote == _risk_finding().quote


@pytest.mark.asyncio
async def test_run_filters_relevant_criteria_and_defect_ratings(
    sample_chapter: PFBChapter,
    sample_intention_response: IntentionAnalysisResponse,
) -> None:
    criteria = _response_with_criteria(
        ("BESTIMMTHEIT", PASSING_RATING),
        ("NORM_VERANKERUNG", PASSING_RATING),
        ("FUNDIERUNG", DEFECT_RATING),
    )
    quality_responses = [
        _quality_response(quality_item(PASSING_RATING), quality_item(DEFECT_RATING)),
        _quality_response(quality_item(DEFECT_RATING, quote="Fehlende Norm.")),
    ]
    mocks = _workflow_patches(sample_intention_response, criteria, quality_responses)
    analyze_intention, rate_criteria, analyze_quality, formulate_risks = mocks

    with (
        patch("src.workflows.risk_checker.analyze_intention", analyze_intention),
        patch("src.workflows.risk_checker.rate_criteria_relevance", rate_criteria),
        patch("src.workflows.risk_checker.analyze_quality", analyze_quality),
        patch("src.workflows.risk_checker.formulate_risks", formulate_risks),
    ):
        await RiskCheckerWorkflow().run(sample_chapter)

    input_arg = formulate_risks.call_args.args[0]
    assert analyze_quality.call_count == EXPECTED_RELEVANT_CRITERIA
    assert isinstance(input_arg, RiskFormulatorInput)
    assert set(input_arg.quality_defects) == {FIRST_DEFECT_ID, SECOND_DEFECT_ID}
    assert all(item.rating == DEFECT_RATING for item in input_arg.quality_defects.values())


@pytest.mark.asyncio
async def test_run_skips_quality_and_risk_steps_without_relevant_criteria(
    sample_chapter: PFBChapter,
    sample_intention_response: IntentionAnalysisResponse,
) -> None:
    criteria = _response_with_criteria(("FUNDIERUNG", DEFECT_RATING))
    mocks = _workflow_patches(sample_intention_response, criteria, [])
    analyze_intention, rate_criteria, analyze_quality, formulate_risks = mocks

    with (
        patch("src.workflows.risk_checker.analyze_intention", analyze_intention),
        patch("src.workflows.risk_checker.rate_criteria_relevance", rate_criteria),
        patch("src.workflows.risk_checker.analyze_quality", analyze_quality),
        patch("src.workflows.risk_checker.formulate_risks", formulate_risks),
    ):
        result = await RiskCheckerWorkflow().run(sample_chapter)

    assert result.risks == []
    analyze_quality.assert_not_called()
    formulate_risks.assert_not_called()


@pytest.mark.asyncio
async def test_run_skips_risk_formulation_when_quality_checks_pass(
    sample_chapter: PFBChapter,
    sample_intention_response: IntentionAnalysisResponse,
    passing_quality_response: QualityAnalysisResponse,
) -> None:
    criteria = _response_with_criteria(("BESTIMMTHEIT", PASSING_RATING))
    mocks = _workflow_patches(sample_intention_response, criteria, [passing_quality_response])
    analyze_intention, rate_criteria, analyze_quality, formulate_risks = mocks

    with (
        patch("src.workflows.risk_checker.analyze_intention", analyze_intention),
        patch("src.workflows.risk_checker.rate_criteria_relevance", rate_criteria),
        patch("src.workflows.risk_checker.analyze_quality", analyze_quality),
        patch("src.workflows.risk_checker.formulate_risks", formulate_risks),
    ):
        result = await RiskCheckerWorkflow().run(sample_chapter)

    assert result.risks == []
    analyze_quality.assert_called_once()
    formulate_risks.assert_not_called()
