"""Tests for risk checker workflow helper functions."""

from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from prompt_injection.prompt_defense import EXT_DATA_TAG_CLOSE, EXT_DATA_TAG_OPEN

from src.config.env import ENV
from src.schemas.workflow import (
    CriteriaDefinitionResponse,
    IntentionAnalysisResponse,
    QualityAnalysisRequest,
    QualityAnalysisResponse,
    RiskFinderOutput,
    RiskFormulatorFinding,
    RiskFormulatorInput,
    RiskFormulatorResponse,
)
from src.workflows.risk_checker import (
    analyze_intention,
    analyze_quality,
    format_risk_findings,
    formulate_risks,
    rate_criteria_relevance,
)

EXPECTED_RISK_COUNT = 2
SEVERITY_LOW = 4
SEVERITY_HIGH = 7


def intention_payload() -> dict[str, str]:
    return {
        "analysis_rationale": "Das Kapitel dient der Entscheidung.",
        "main_part": "ENTSCHEIDUNG",
        "subpart": "Tenor",
        "structure": "Entscheidung mit Begründung.",
        "purpose": "Planfeststellung erteilen.",
        "content_focus": "Entscheidung",
        "exclusions": "Keine Einwendungsprüfung",
        "dependencies": "Baut auf der Abwägung auf",
    }


def criteria_payload() -> dict[str, Any]:
    return {
        "criterion_ratings": [
            {
                "criterion": "BESTIMMTHEIT",
                "relevance_rating": SEVERITY_LOW,
                "fullfilment_minimal": "Minimal.",
                "fullfilment_optimal": "Optimal.",
                "fullfilment_negative": "Negativ.",
            }
        ]
    }


def quality_payload() -> dict[str, Any]:
    return {
        "quality_check_results": [
            {
                "quote": "Unklarer Begriff.",
                "rating": 2,
                "rating_rationale": "Zu unbestimmt.",
                "breached_standard_negative": "Unklar.",
            }
        ]
    }


def risk_payload() -> RiskFormulatorResponse:
    return RiskFormulatorResponse(
        risks=[
            RiskFormulatorFinding(
                involved_defects=[1],
                main_defect_id=1,
                quote="Unklarer Begriff.",
                description="Die Formulierung bleibt unbestimmt.",
                implications="Die Passage könnte angegriffen werden.",
                recommendation="Es könnte eine Konkretisierung geprüft werden.",
                severity=SEVERITY_HIGH,
            )
        ]
    )


def quality_request() -> QualityAnalysisRequest:
    return QualityAnalysisRequest(
        chapter="Kapiteltext mit <|injected|> Marker.",
        analysis_focus="BESTIMMTHEIT",
        main_part="ENTSCHEIDUNG",
        subpart="Tenor",
        purpose="Planfeststellung erteilen.",
        structure="Liste",
        exclusions="Keine Begründung",
        dependencies="Keine",
        fullfilment_minimal="Minimal.",
        fullfilment_optimal="Optimal.",
        fullfilment_negative="Negativ.",
    )


def risk_input() -> RiskFormulatorInput:
    item = QualityAnalysisResponse.model_validate(quality_payload()).quality_check_results[0]
    return RiskFormulatorInput(chapter_text="Kapiteltext <|command|>.", quality_defects={1: item})


async def call_with_mocked_llm(
    func: Callable[..., Awaitable[Any]],
    response: Any,
    *args: Any,
) -> tuple[Any, AsyncMock]:
    mock_llm = AsyncMock(return_value=response)
    with patch("src.workflows.risk_checker.llm_invoke_structured", mock_llm):
        result = await func(*args)
    return result, mock_llm


@pytest.mark.asyncio
async def test_analyze_intention_wraps_external_chapter_text() -> None:
    result, mock_llm = await call_with_mocked_llm(
        analyze_intention,
        intention_payload(),
        "Kapitel <|injected|> Inhalt.",
    )
    kwargs = mock_llm.call_args.kwargs
    assert isinstance(result, IntentionAnalysisResponse)
    assert kwargs["model"] == ENV.LITELLM.MODEL
    assert kwargs["output_class"] is IntentionAnalysisResponse
    assert EXT_DATA_TAG_OPEN in kwargs["prompt"]
    assert "<|injected|>" not in kwargs["prompt"]
    assert EXT_DATA_TAG_CLOSE in kwargs["system_prompt"]


@pytest.mark.asyncio
async def test_rate_criteria_relevance_formats_all_intention_fields(
    sample_intention_response: IntentionAnalysisResponse,
) -> None:
    result, mock_llm = await call_with_mocked_llm(
        rate_criteria_relevance,
        criteria_payload(),
        sample_intention_response,
    )
    prompt = mock_llm.call_args.kwargs["prompt"]
    assert isinstance(result, CriteriaDefinitionResponse)
    assert mock_llm.call_args.kwargs["output_class"] is CriteriaDefinitionResponse
    assert sample_intention_response.content_focus in prompt
    assert sample_intention_response.dependencies in prompt


@pytest.mark.asyncio
async def test_analyze_quality_formats_request_context() -> None:
    result, mock_llm = await call_with_mocked_llm(analyze_quality, quality_payload(), quality_request())
    prompt = mock_llm.call_args.kwargs["prompt"]
    assert isinstance(result, QualityAnalysisResponse)
    assert mock_llm.call_args.kwargs["output_class"] is QualityAnalysisResponse
    assert "BESTIMMTHEIT" in prompt
    assert "<|injected|>" not in prompt


@pytest.mark.asyncio
async def test_formulate_risks_formats_chapter_and_defects() -> None:
    result, mock_llm = await call_with_mocked_llm(formulate_risks, risk_payload(), risk_input())
    prompt = mock_llm.call_args.kwargs["prompt"]
    assert result == risk_payload().risks
    assert mock_llm.call_args.kwargs["output_class"] is RiskFormulatorResponse
    assert "Unklarer Begriff." in prompt
    assert "<|command|>" not in prompt


@pytest.mark.asyncio
async def test_llm_errors_are_propagated(sample_intention_response: IntentionAnalysisResponse) -> None:
    mock_llm = AsyncMock(side_effect=RuntimeError("LLM invocation failed"))
    with (
        patch("src.workflows.risk_checker.llm_invoke_structured", mock_llm),
        pytest.raises(RuntimeError, match="LLM invocation failed"),
    ):
        await rate_criteria_relevance(sample_intention_response)


@pytest.mark.asyncio
async def test_format_risk_findings_maps_fields_and_generates_ids() -> None:
    chapter_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    source_findings = [
        risk_payload().risks[0],
        RiskFormulatorFinding(
            involved_defects=[2],
            main_defect_id=2,
            quote="Weiterer Begriff.",
            description="Weitere Unklarheit.",
            implications="Zusätzlicher Angriffspunkt.",
            recommendation="Zusätzliche Konkretisierung prüfen.",
            severity=SEVERITY_LOW,
        ),
    ]
    result = await format_risk_findings(chapter_id, source_findings)
    assert isinstance(result, RiskFinderOutput)
    assert len(result.risks) == EXPECTED_RISK_COUNT
    assert {risk.chapter_id for risk in result.risks} == {chapter_id}
    assert result.risks[0].risk_id != result.risks[1].risk_id
    assert [risk.quote for risk in result.risks] == [finding.quote for finding in source_findings]
