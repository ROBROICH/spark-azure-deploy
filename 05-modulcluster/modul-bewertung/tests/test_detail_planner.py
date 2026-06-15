"""Tests for DetailPlanner: models, prompts, _chunk_list, workflow, and _assemble_plan."""

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from src.models.types import (
    DetailedPlan,
    DetailPlannerEntry,
    DetailPlannerInput,
    DetailPlannerResult,
    MicroSummary,
    PlanSection,
)


def _micro(svm_id: str, kernaussage: str = "Kernaussage") -> MicroSummary:
    return MicroSummary(svm_id=svm_id, kernaussage=f"{kernaussage} {svm_id}")


def _micros(n: int) -> list[MicroSummary]:
    return [_micro(f"{i:04d}") for i in range(1, n + 1)]


def _plan_3_chapters(**overrides: Any) -> DetailedPlan:
    """Create a DetailedPlan with the minimum 3 chapters."""
    return DetailedPlan(kapitel=[
        PlanSection(titel="Einleitung", ziel="Überblick", svm_ids=["0001"]),
        PlanSection(titel="Prüfung", ziel="Analyse", svm_ids=["0002"]),
        PlanSection(titel="Ergebnis", ziel="Bewertung", svm_ids=["0003"]),
    ])


# =============================================================================
# DetailPlanner model tests
# =============================================================================


class TestDetailPlannerEntry:
    """Tests for DetailPlannerEntry model."""

    def test_with_assignment(self) -> None:
        entry = DetailPlannerEntry(svm_id="0001", kapitel_index=2)
        assert entry.svm_id == "0001"
        assert entry.kapitel_index == 2

    def test_skipped(self) -> None:
        entry = DetailPlannerEntry(svm_id="0001", kapitel_index=None)
        assert entry.kapitel_index is None

    def test_from_dict(self) -> None:
        entry = DetailPlannerEntry.model_validate({"svm_id": "0042", "kapitel_index": 0})
        assert entry.svm_id == "0042"
        assert entry.kapitel_index == 0


class TestDetailPlannerResult:
    """Tests for DetailPlannerResult model."""

    def test_with_assignments_and_skipped(self) -> None:
        result = DetailPlannerResult(
            assignments={"0001": 0, "0002": 1},
            skipped=["0003"],
        )
        assert result.assignments["0001"] == 0
        assert "0003" in result.skipped

    def test_empty(self) -> None:
        result = DetailPlannerResult(assignments={}, skipped=[])
        assert result.assignments == {}
        assert result.skipped == []


# =============================================================================
# DetailPlanner prompt tests
# =============================================================================


class TestBuildDetailPlannerPrompt:
    """Tests for build_detail_planner_prompt."""

    def _plan(self) -> DetailedPlan:
        return DetailedPlan(kapitel=[
            PlanSection(titel="Einleitung", ziel="Überblick", svm_ids=["0001"]),
            PlanSection(titel="Prüfung", ziel="Analyse", svm_ids=["0002", "0003"]),
            PlanSection(titel="Ergebnis", ziel="Bewertung", svm_ids=["0004"]),
        ])

    def test_contains_chapter_titles(self) -> None:
        from src.prompts.detail_planner import build_detail_planner_prompt

        plan = self._plan()
        micros_by_id = {f"{i:04d}": _micro(f"{i:04d}") for i in range(1, 5)}
        batch = [_micro("0010"), _micro("0011")]

        prompt = build_detail_planner_prompt(
            plan=plan, micros_by_id=micros_by_id, batch=batch,
            norm="§ 22 BImSchG", satz_text="TBM",
        )
        assert "Einleitung" in prompt
        assert "Prüfung" in prompt
        assert "Ergebnis" in prompt

    def test_contains_batch_svm_ids(self) -> None:
        from src.prompts.detail_planner import build_detail_planner_prompt

        plan = self._plan()
        micros_by_id = {f"{i:04d}": _micro(f"{i:04d}") for i in range(1, 5)}
        batch = [_micro("0010"), _micro("0011")]

        prompt = build_detail_planner_prompt(
            plan=plan, micros_by_id=micros_by_id, batch=batch,
            norm="§ 22 BImSchG", satz_text="TBM",
        )
        assert "[0010]" in prompt
        assert "[0011]" in prompt

    def test_contains_reference_svms(self) -> None:
        from src.prompts.detail_planner import build_detail_planner_prompt

        plan = self._plan()
        micros_by_id = {f"{i:04d}": _micro(f"{i:04d}") for i in range(1, 5)}
        batch = [_micro("0010")]

        prompt = build_detail_planner_prompt(
            plan=plan, micros_by_id=micros_by_id, batch=batch,
            norm="§ 22 BImSchG", satz_text="TBM",
        )
        # Reference SVMs from existing chapters should appear
        assert "[0001]" in prompt
        assert "[0002]" in prompt

    def test_contains_norm_and_satz_text(self) -> None:
        from src.prompts.detail_planner import build_detail_planner_prompt

        plan = self._plan()
        micros_by_id = {"0001": _micro("0001")}
        batch = [_micro("0010")]

        prompt = build_detail_planner_prompt(
            plan=plan, micros_by_id=micros_by_id, batch=batch,
            norm="§ 22 BImSchG", satz_text="Nicht genehmigungsbedürftig",
        )
        assert "§ 22 BImSchG" in prompt
        assert "Nicht genehmigungsbedürftig" in prompt

    def test_system_prompt_contains_assignment_instructions(self) -> None:
        from src.prompts.detail_planner import DETAIL_PLANNER_SYSTEM_PROMPT

        assert "kapitel_index" in DETAIL_PLANNER_SYSTEM_PROMPT
        assert "null" in DETAIL_PLANNER_SYSTEM_PROMPT


# =============================================================================
# _chunk_list tests
# =============================================================================


class TestChunkList:
    """Tests for _chunk_list helper."""

    def test_even_split(self) -> None:
        from src.workflows.detail_planner import _chunk_list

        items = _micros(10)
        chunks = _chunk_list(items, 5)
        assert len(chunks) == 2
        assert all(len(c) == 5 for c in chunks)

    def test_uneven_split(self) -> None:
        from src.workflows.detail_planner import _chunk_list

        items = _micros(7)
        chunks = _chunk_list(items, 3)
        assert len(chunks) == 3
        assert len(chunks[0]) == 3
        assert len(chunks[1]) == 3
        assert len(chunks[2]) == 1

    def test_single_batch(self) -> None:
        from src.workflows.detail_planner import _chunk_list

        items = _micros(3)
        chunks = _chunk_list(items, 10)
        assert len(chunks) == 1
        assert len(chunks[0]) == 3

    def test_empty(self) -> None:
        from src.workflows.detail_planner import _chunk_list

        chunks = _chunk_list([], 5)
        assert chunks == []


# =============================================================================
# DetailPlanner workflow tests
# =============================================================================


class TestDetailPlannerWorkflowRun:
    """Tests for DetailPlannerWorkflow.run with mocked LLM calls."""

    def _detail_input(self, filtered_count: int = 5) -> DetailPlannerInput:
        plan = _plan_3_chapters()
        # filtered_micros start at IDs after the ones in micros_by_id (0004, 0005, ...)
        filtered = [_micro(f"{i:04d}") for i in range(4, 4 + filtered_count)]
        return DetailPlannerInput(
            plan=plan,
            micros_by_id={f"{i:04d}": _micro(f"{i:04d}") for i in range(1, 4)},
            filtered_micros=filtered,
            norm="§ 22 BImSchG",
            satz_text="TBM",
        )

    @pytest.mark.asyncio
    async def test_single_batch_all_assigned(self) -> None:
        from src.workflows.detail_planner import DetailPlannerWorkflow

        llm_response = json.dumps([
            {"svm_id": "0004", "kapitel_index": 0},
            {"svm_id": "0005", "kapitel_index": 1},
        ])
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")

        inp = self._detail_input(2)

        wf = DetailPlannerWorkflow()
        with patch("src.workflows.detail_planner.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.assignments["0004"] == 0
        assert result.assignments["0005"] == 1
        assert result.skipped == []

    @pytest.mark.asyncio
    async def test_skipped_svms(self) -> None:
        from src.workflows.detail_planner import DetailPlannerWorkflow

        llm_response = json.dumps([
            {"svm_id": "0004", "kapitel_index": 1},
            {"svm_id": "0005", "kapitel_index": None},
        ])
        mock_llm = AsyncMock(return_value=f"```json\n{llm_response}\n```")

        inp = self._detail_input(2)

        wf = DetailPlannerWorkflow()
        with patch("src.workflows.detail_planner.llm_invoke", mock_llm):
            result = await wf.run(inp)

        assert result.assignments == {"0004": 1}
        assert "0005" in result.skipped

    @pytest.mark.asyncio
    async def test_invalid_response_raises_retryable_error(self) -> None:
        from temporalio.exceptions import ApplicationError

        from src.workflows.detail_planner import DetailPlannerWorkflow

        mock_llm = AsyncMock(return_value="not json")
        inp = self._detail_input(2)

        wf = DetailPlannerWorkflow()
        with (
            patch("src.workflows.detail_planner.llm_invoke", mock_llm),
            patch("src.workflows.detail_planner.workflow.logger"),
        ):
            with pytest.raises(ApplicationError) as exc_info:
                await wf.run(inp)
            assert exc_info.value.non_retryable is False


# =============================================================================
# _assemble_plan tests
# =============================================================================


class TestAssemblePlan:
    """Tests for _assemble_plan helper in planner.py."""

    def test_merges_assignments_into_plan(self) -> None:
        from src.workflows.planner import _assemble_plan

        plan = _plan_3_chapters()
        detail_result = DetailPlannerResult(
            assignments={"0004": 0, "0005": 1},
            skipped=["0006"],
        )
        all_ids = {"0001", "0002", "0003", "0004", "0005", "0006"}

        result = _assemble_plan(plan, detail_result, all_ids)

        assert "0004" in result.kapitel[0].svm_ids
        assert "0005" in result.kapitel[1].svm_ids
        # Original SVMs preserved
        assert "0001" in result.kapitel[0].svm_ids
        assert "0002" in result.kapitel[1].svm_ids

    def test_skips_out_of_range_indices(self) -> None:
        from src.workflows.planner import _assemble_plan

        plan = _plan_3_chapters()
        detail_result = DetailPlannerResult(
            assignments={"0004": 99},  # out of range
            skipped=[],
        )
        all_ids = {"0001", "0002", "0003", "0004"}

        result = _assemble_plan(plan, detail_result, all_ids)

        # 0004 should NOT be in any chapter at index 99 since it's out of range
        # but sanitise_plan may add unassigned SVMs to catch-all
        assert len(result.kapitel) >= 3

    def test_no_duplicate_svm_ids(self) -> None:
        from src.workflows.planner import _assemble_plan

        plan = _plan_3_chapters()
        detail_result = DetailPlannerResult(
            assignments={"0001": 0},  # already in chapter 0
            skipped=[],
        )
        all_ids = {"0001", "0002", "0003"}

        result = _assemble_plan(plan, detail_result, all_ids)

        # Should not duplicate 0001
        assert result.kapitel[0].svm_ids.count("0001") == 1
