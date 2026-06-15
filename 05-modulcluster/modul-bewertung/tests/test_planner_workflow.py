"""Tests for PlannerWorkflow: _generate_plan with retry logic, and
the large-micro sampling path that delegates to DetailPlanner."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from temporalio.exceptions import ApplicationError

from src.config import config
from src.models.types import (
    DetailedPlan,
    DetailPlannerResult,
    MicroSummary,
    PlannerInput,
)


def _micro(svm_id: str, kernaussage: str = "Kernaussage") -> MicroSummary:
    return MicroSummary(svm_id=svm_id, kernaussage=f"{kernaussage} {svm_id}")


def _micros(n: int) -> list[MicroSummary]:
    return [_micro(f"{i:04d}") for i in range(1, n + 1)]


def _planner_input(n_micros: int = 5) -> PlannerInput:
    return PlannerInput(
        norm="§ 22 BImSchG",
        satz_text="Nicht genehmigungsbedürftige Anlagen sind so zu betreiben, dass schädliche Umwelteinwirkungen verhindert werden.",
        micros=_micros(n_micros),
    )


def _valid_plan_json(svm_ids: list[str] | None = None) -> str:
    """Build a valid DetailedPlan JSON string."""
    ids = svm_ids or ["0001", "0002", "0003", "0004", "0005"]
    plan = {
        "kapitel": [
            {"titel": "Einleitung", "ziel": "Einordnung", "svm_ids": ids[:2]},
            {"titel": "Prüfung", "ziel": "Analyse", "svm_ids": ids[2:4]},
            {"titel": "Ergebnis", "ziel": "Bewertung", "svm_ids": ids[4:]},
        ],
    }
    return json.dumps(plan, ensure_ascii=False)


# =============================================================================
# _generate_plan — success path
# =============================================================================


class TestPlannerGeneratePlanSuccess:
    """Tests for PlannerWorkflow._generate_plan happy path."""

    @pytest.mark.asyncio
    async def test_valid_plan_returned_on_first_attempt(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(return_value=f"```json\n{_valid_plan_json()}\n```")
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert isinstance(result, DetailedPlan)
        assert len(result.kapitel) == 3
        assert result.kapitel[0].titel == "Einleitung"
        mock_llm.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_uses_temperature_03(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(return_value=f"```json\n{_valid_plan_json()}\n```")
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            await wf.run(inp)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["temperature"] == 0.3

    @pytest.mark.asyncio
    async def test_no_cache_enabled(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(return_value=f"```json\n{_valid_plan_json()}\n```")
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            await wf.run(inp)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["no_cache"] is True

    @pytest.mark.asyncio
    async def test_all_svm_ids_assigned(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(return_value=f"```json\n{_valid_plan_json()}\n```")
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            result = await wf.run(inp)

        all_assigned = set()
        for k in result.kapitel:
            all_assigned.update(k.svm_ids)
        assert all_assigned == {"0001", "0002", "0003", "0004", "0005"}


# =============================================================================
# _generate_plan — retry / correction path
# =============================================================================


class TestPlannerGeneratePlanRetry:
    """Tests for _generate_plan retry logic on validation errors."""

    @pytest.mark.asyncio
    async def test_retries_on_invalid_then_succeeds(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        # First response: valid JSON but fails plan validation (only 2 chapters, min is 3)
        invalid_plan = json.dumps({"kapitel": [
            {"titel": "A", "ziel": "Z", "svm_ids": ["0001"]},
            {"titel": "B", "ziel": "Z", "svm_ids": ["0002"]},
        ]})
        valid_response = f"```json\n{_valid_plan_json()}\n```"
        mock_llm = AsyncMock(side_effect=[
            f"```json\n{invalid_plan}\n```",
            valid_response,
        ])
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with (
            patch("src.workflows.planner.llm_invoke", mock_llm),
            patch("src.workflows.planner.workflow.logger"),
        ):
            result = await wf.run(inp)

        assert isinstance(result, DetailedPlan)
        assert mock_llm.await_count == 2

    @pytest.mark.asyncio
    async def test_raises_retryable_error_after_max_attempts(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(return_value="not json at all")
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with (
            patch("src.workflows.planner.llm_invoke", mock_llm),
            patch("src.workflows.planner.workflow.logger"),
        ):
            with pytest.raises(ApplicationError) as exc_info:
                await wf.run(inp)
            assert exc_info.value.non_retryable is False

    @pytest.mark.asyncio
    async def test_application_error_propagated_immediately(self) -> None:
        """ApplicationError from parse_json_response should be re-raised immediately."""
        from src.workflows.planner import PlannerWorkflow

        mock_llm = AsyncMock(side_effect=ApplicationError("LLM error", non_retryable=True))
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            with pytest.raises(ApplicationError) as exc_info:
                await wf.run(inp)
            assert exc_info.value.non_retryable is True
            # Should fail on first attempt without retrying
            assert mock_llm.await_count == 1

    @pytest.mark.asyncio
    async def test_correction_prompt_sent_on_retry(self) -> None:
        """On validation error, a correction prompt should be built for the retry."""
        from src.workflows.planner import PlannerWorkflow

        # First response: valid JSON but fails plan validation (only 2 chapters, min is 3)
        invalid_plan = json.dumps({"kapitel": [
            {"titel": "A", "ziel": "Z", "svm_ids": ["0001"]},
            {"titel": "B", "ziel": "Z", "svm_ids": ["0002"]},
        ]})
        valid_response = f"```json\n{_valid_plan_json()}\n```"
        mock_llm = AsyncMock(side_effect=[
            f"```json\n{invalid_plan}\n```",
            valid_response,
        ])
        inp = _planner_input(5)

        wf = PlannerWorkflow()
        with (
            patch("src.workflows.planner.llm_invoke", mock_llm),
            patch("src.workflows.planner.workflow.logger"),
        ):
            result = await wf.run(inp)

        assert isinstance(result, DetailedPlan)
        # Second call should have different prompt (correction prompt)
        first_call_prompt = mock_llm.call_args_list[0].kwargs.get("prompt", "")
        second_call_prompt = mock_llm.call_args_list[1].kwargs.get("prompt", "")
        assert first_call_prompt != second_call_prompt


# =============================================================================
# PlannerWorkflow.run — large-micro sampling + DetailPlanner delegation
# =============================================================================


class TestPlannerWorkflowLargeMicros:
    """Tests for the sampling + DetailPlanner delegation path in PlannerWorkflow.run."""

    @pytest.mark.asyncio
    async def test_delegates_to_detail_planner_for_large_sets(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        n_micros = config.DETAIL_PLANNER.MAX_PLANNER_MICROS + 100
        inp = _planner_input(n_micros)

        valid_plan = _valid_plan_json([f"{i:04d}" for i in range(1, 6)])
        mock_llm = AsyncMock(return_value=f"```json\n{valid_plan}\n```")

        detail_result = DetailPlannerResult(
            assignments={"0601": 0, "0602": 1},
            skipped=["0700"],
        )

        mock_child_wf = AsyncMock(return_value=detail_result)

        wf = PlannerWorkflow()
        with (
            patch("src.workflows.planner.llm_invoke", mock_llm),
            patch("temporalio.workflow.execute_child_workflow", mock_child_wf),
            patch("temporalio.workflow.uuid4", return_value="test-uuid"),
        ):
            result = await wf.run(inp)

        assert isinstance(result, DetailedPlan)
        mock_child_wf.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_delegation_for_small_sets(self) -> None:
        from src.workflows.planner import PlannerWorkflow

        inp = _planner_input(50)  # < MAX_PLANNER_MICROS
        mock_llm = AsyncMock(return_value=f"```json\n{_valid_plan_json([f'{i:04d}' for i in range(1, 51)])}\n```")

        wf = PlannerWorkflow()
        with patch("src.workflows.planner.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert isinstance(result, DetailedPlan)
        # LLM called directly, no child workflow delegation
        mock_llm.assert_awaited_once()
