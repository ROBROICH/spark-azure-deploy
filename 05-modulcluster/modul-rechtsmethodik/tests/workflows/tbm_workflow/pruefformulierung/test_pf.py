# ruff: noqa: PLR2004
"""Tests for PruefFormulierungsAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.pruefformulierung.pf import PruefFormulierungsAgentWorkflow
from src.workflows.tbm_workflow.pruefformulierung.pf_data_format import Pruefformulierung, PruefFormulierungsAgentOutput

_PATCH = "src.workflows.tbm_workflow.pruefformulierung.pf.llm_invoke"


def _make_pruefung(id: str) -> Pruefformulierung:
    return Pruefformulierung(
        id=id,
        prueffrage=f"Liegt TBM {id} vor?",
        pruefgegenstand=f"Prüfe, ob TBM {id} erfüllt ist.",
    )


def _make_llm_output(count: int) -> PruefFormulierungsAgentOutput:
    return PruefFormulierungsAgentOutput(pruefungen=[_make_pruefung(str(i)) for i in range(count)])


class TestPruefFormulierungsAgentWorkflow:
    async def test_calls_llm_once_for_small_input(self) -> None:
        """Tests if the LLM is called exactly once for a small list of TBMs fitting in a single batch."""
        tbms = ["TBM A", "TBM B"]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_llm_output(2)
            await PruefFormulierungsAgentWorkflow().run(tbms)

        mock_llm.assert_called_once()

    async def test_returns_one_pruefformulierung_per_tbm(self) -> None:
        """Tests if exactly one Pruefformulierung is returned per input TBM."""
        tbms = ["TBM A", "TBM B", "TBM C"]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_llm_output(3)
            result = await PruefFormulierungsAgentWorkflow().run(tbms)

        assert len(result) == 3

    @pytest.mark.parametrize("count", [1, 5, 10])
    async def test_output_count_matches_input(self, count: int) -> None:
        """Tests if the output Pruefformulierung count matches the parametrized input count."""
        tbms = [f"TBM {i}" for i in range(count)]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_llm_output(count)
            result = await PruefFormulierungsAgentWorkflow().run(tbms)

        assert len(result) == count

    async def test_empty_input_returns_empty_list(self) -> None:
        """Tests if an empty TBM list returns an empty result without calling the LLM."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await PruefFormulierungsAgentWorkflow().run([])

        mock_llm.assert_not_called()
        assert result == []

    async def test_batches_large_input(self) -> None:
        """Tests if a large TBM list is batched into multiple LLM calls and all results are combined."""
        tbms = [f"TBM {i}" for i in range(55)]
        batch_output = _make_llm_output(50)
        remainder_output = _make_llm_output(5)
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = [batch_output, remainder_output]
            result = await PruefFormulierungsAgentWorkflow().run(tbms)

        assert mock_llm.call_count == 2
        assert len(result) == 55

    async def test_exactly_batch_size_is_single_batch(self) -> None:
        """Tests if exactly BATCH_SIZE (50) TBMs results in a single LLM call."""
        tbms = [f"TBM {i}" for i in range(50)]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_llm_output(50)
            await PruefFormulierungsAgentWorkflow().run(tbms)

        mock_llm.assert_called_once()
