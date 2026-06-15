"""Tests for Applicability pre-check: models, prompts, and workflow."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.config import config
from src.models.types import (
    ApplicabilityInput,
    ApplicabilityResult,
    ApplicabilityStatus,
    MicroSummary,
)


def _micro(svm_id: str, kernaussage: str = "Kernaussage") -> MicroSummary:
    return MicroSummary(svm_id=svm_id, kernaussage=f"{kernaussage} {svm_id}")


def _micros(n: int) -> list[MicroSummary]:
    return [_micro(f"{i:04d}") for i in range(1, n + 1)]


def _applicability_input(micros: list[MicroSummary] | None = None) -> ApplicabilityInput:
    return ApplicabilityInput(
        norm="§ 22 BImSchG",
        satz_text="Nicht genehmigungsbedürftige Anlagen sind so zu betreiben, dass schädliche Umwelteinwirkungen verhindert werden.",
        micros=micros or _micros(5),
    )


# =============================================================================
# ApplicabilityResult model tests
# =============================================================================


class TestApplicabilityResult:
    """Tests for ApplicabilityResult model validation."""

    def test_anwendbar_minimal(self) -> None:
        result = ApplicabilityResult(status=ApplicabilityStatus.BEWERTEN)
        assert result.status == ApplicabilityStatus.BEWERTEN
        assert result.begruendung_markdown is None
        assert result.kurzform is None

    def test_nicht_anwendbar_with_begruendung(self) -> None:
        result = ApplicabilityResult(
            status=ApplicabilityStatus.UEBERSPRINGEN,
            begruendung_markdown="## Begründung\n\nNicht anwendbar.",
            kurzform="Genehmigungsbedürftige Anlage.",
        )
        assert result.status == ApplicabilityStatus.UEBERSPRINGEN
        assert result.begruendung_markdown is not None
        assert "Begründung" in result.begruendung_markdown
        assert result.kurzform == "Genehmigungsbedürftige Anlage."

    def test_nicht_beurteilbar(self) -> None:
        result = ApplicabilityResult(
            status=ApplicabilityStatus.NICHT_BEURTEILBAR,
            begruendung_markdown="## Info fehlt",
            kurzform="Keine Infos.",
        )
        assert result.status == ApplicabilityStatus.NICHT_BEURTEILBAR

    def test_status_from_string(self) -> None:
        result = ApplicabilityResult.model_validate({
            "status": "überspringen",
            "begruendung_markdown": "Grund",
            "kurzform": "Kurz",
        })
        assert result.status == ApplicabilityStatus.UEBERSPRINGEN

    def test_invalid_status_raises(self) -> None:
        with pytest.raises(ValueError):
            ApplicabilityResult.model_validate({"status": "ungueltig"})


class TestApplicabilityInput:
    """Tests for ApplicabilityInput model."""

    def test_creation(self) -> None:
        inp = _applicability_input()
        assert inp.norm == "§ 22 BImSchG"
        assert len(inp.micros) == 5

    def test_requires_at_least_one_micro(self) -> None:
        with pytest.raises(ValueError):
            ApplicabilityInput(
                norm="§ 22 BImSchG",
                satz_text="TBM",
                micros=[],
            )


# =============================================================================
# Applicability prompt tests
# =============================================================================


class TestBuildApplicabilityPrompt:
    """Tests for build_applicability_prompt."""

    def test_contains_tbm(self) -> None:
        from src.prompts.applicability import build_applicability_prompt

        inp = _applicability_input()
        prompt = build_applicability_prompt(inp, inp.micros)
        assert "Nicht genehmigungsbedürftige Anlagen" in prompt

    def test_contains_norm(self) -> None:
        from src.prompts.applicability import build_applicability_prompt

        inp = _applicability_input()
        prompt = build_applicability_prompt(inp, inp.micros)
        assert "§ 22 BImSchG" in prompt

    def test_contains_all_micro_ids(self) -> None:
        from src.prompts.applicability import build_applicability_prompt

        micros = _micros(3)
        inp = _applicability_input(micros)
        prompt = build_applicability_prompt(inp, micros)
        assert "[0001]" in prompt
        assert "[0002]" in prompt
        assert "[0003]" in prompt

    def test_contains_kernaussagen(self) -> None:
        from src.prompts.applicability import build_applicability_prompt

        micros = [MicroSummary(svm_id="0001", kernaussage="Anlage ist genehmigungsbedürftig")]
        inp = _applicability_input(micros)
        prompt = build_applicability_prompt(inp, micros)
        assert "Anlage ist genehmigungsbedürftig" in prompt

    def test_system_prompt_contains_key_instructions(self) -> None:
        from src.prompts.applicability import APPLICABILITY_SYSTEM_PROMPT

        assert "bewerten" in APPLICABILITY_SYSTEM_PROMPT
        assert "überspringen" in APPLICABILITY_SYSTEM_PROMPT
        assert "nicht_beurteilbar" in APPLICABILITY_SYSTEM_PROMPT


# =============================================================================
# Applicability workflow tests
# =============================================================================


class TestApplicabilityWorkflowRun:
    """Tests for ApplicabilityWorkflow.run with mocked LLM calls."""

    @pytest.mark.asyncio
    async def test_anwendbar_result(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "bewerten",
            "begruendung_markdown": None,
            "kurzform": None,
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")
        inp = _applicability_input()

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.status == ApplicabilityStatus.BEWERTEN
        assert result.begruendung_markdown is None
        mock_llm.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_nicht_anwendbar_result(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "überspringen",
            "begruendung_markdown": "## Vorfilter\n\nGenehmigungsbedürftige Anlage.",
            "kurzform": "Die Anlage ist genehmigungsbedürftig.",
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")
        inp = _applicability_input()

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.status == ApplicabilityStatus.UEBERSPRINGEN
        assert result.kurzform is not None
        assert "genehmigungsbedürftig" in result.kurzform

    @pytest.mark.asyncio
    async def test_nicht_beurteilbar_result(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "nicht_beurteilbar",
            "begruendung_markdown": "## Zusammenfassung\n\nFehlende Info.",
            "kurzform": "Keine ausreichenden Informationen.",
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")
        inp = _applicability_input()

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.status == ApplicabilityStatus.NICHT_BEURTEILBAR
        assert result.begruendung_markdown is not None

    @pytest.mark.asyncio
    async def test_sampling_applied_for_large_micro_sets(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "bewerten",
            "begruendung_markdown": None,
            "kurzform": None,
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")

        max_micros = config.APPLICABILITY.MAX_MICROS
        n = max_micros + 100
        inp = _applicability_input(_micros(n))

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.status == ApplicabilityStatus.BEWERTEN
        # Check that the prompt was built with sampled micros (not all n)
        call_args = mock_llm.call_args
        prompt = call_args.kwargs.get("prompt", call_args[0][0] if call_args[0] else "")
        # Last micro ID should NOT appear (it was sampled out)
        assert f"[{n:04d}]" not in prompt

    @pytest.mark.asyncio
    async def test_no_sampling_below_threshold(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "bewerten",
            "begruendung_markdown": None,
            "kurzform": None,
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")

        inp = _applicability_input(_micros(50))

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.status == ApplicabilityStatus.BEWERTEN
        call_args = mock_llm.call_args
        prompt = call_args.kwargs.get("prompt", call_args[0][0] if call_args[0] else "")
        # All 50 IDs should be present
        assert "[0050]" in prompt

    @pytest.mark.asyncio
    async def test_invalid_llm_response_raises_retryable_error(self) -> None:
        from temporalio.exceptions import ApplicationError

        from src.workflows.applicability import ApplicabilityWorkflow

        mock_llm = AsyncMock(return_value="This is not JSON at all")
        inp = _applicability_input()

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            with pytest.raises(ApplicationError) as exc_info:
                await wf.run(inp)
            assert exc_info.value.non_retryable is False

    @pytest.mark.asyncio
    async def test_uses_temperature_01(self) -> None:
        from src.workflows.applicability import ApplicabilityWorkflow

        llm_response = json.dumps({
            "status": "bewerten",
            "begruendung_markdown": None,
            "kurzform": None,
        })
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")
        inp = _applicability_input()

        wf = ApplicabilityWorkflow()
        with patch("src.workflows.applicability.llm_invoke", mock_llm):
            await wf.run(inp)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs.get("temperature") == 0.1
