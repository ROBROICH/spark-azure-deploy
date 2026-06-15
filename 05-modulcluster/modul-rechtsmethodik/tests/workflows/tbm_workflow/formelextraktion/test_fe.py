# ruff: noqa: RUF001
"""Tests for FormelExtrahiererAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.formelextraktion.fe import FormelExtrahiererAgentWorkflow
from src.workflows.tbm_workflow.formelextraktion.fe_data_format import FormelextrahiererAgentOutput
from src.workflows.tbm_workflow.tbm_types import FormelextrahiererAgentInput

_PATCH = "src.workflows.tbm_workflow.formelextraktion.fe.llm_invoke"


@pytest.fixture
def workflow_input() -> FormelextrahiererAgentInput:
    return FormelextrahiererAgentInput(
        satz_text="Der Antrag ist zu genehmigen.",
        atomare_tatbestandsmerkmale=["Antrag liegt vor", "Voraussetzungen erfüllt"],
        rechtsfolge="Genehmigung wird erteilt",
    )


class TestFormelExtrahiererAgentWorkflow:
    async def test_calls_llm_once(self, workflow_input: FormelextrahiererAgentInput) -> None:
        """Tests if the LLM is called exactly once during formula extraction."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = FormelextrahiererAgentOutput(formel="TBM_1 ∧ TBM_2")
            await FormelExtrahiererAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_returns_formula_with_german_operators(self, workflow_input: FormelextrahiererAgentInput) -> None:
        """Tests if the formula is returned with German operator names instead of logical symbols."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = FormelextrahiererAgentOutput(formel="TBM_1 ∧ TBM_2")
            result = await FormelExtrahiererAgentWorkflow().run(workflow_input)

        assert result == "TBM_1 und TBM_2"

    @pytest.mark.parametrize(
        "raw_formel,expected",
        [
            ("TBM_1 ∧ TBM_2", "TBM_1 und TBM_2"),
            ("TBM_1 ∨ TBM_2", "TBM_1 oder TBM_2"),
            ("¬TBM_1", "nicht TBM_1"),
            ("TBM_1 ∧ TBM_2 ∨ ¬TBM_3", "TBM_1 und TBM_2 oder nicht TBM_3"),
            ("TBM_1", "TBM_1"),
        ],
    )
    async def test_operator_conversion(
        self, workflow_input: FormelextrahiererAgentInput, raw_formel: str, expected: str
    ) -> None:
        """Tests if logical operator symbols are correctly converted to their German text equivalents."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = FormelextrahiererAgentOutput(formel=raw_formel)
            result = await FormelExtrahiererAgentWorkflow().run(workflow_input)

        assert result == expected
