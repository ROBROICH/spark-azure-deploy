# ruff: noqa: PLR2004
"""Tests for ErgebnisFormuliererAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.workflows.rechtsmethodik.types import Auslegungsvorschlag, UnbestimmterRechtsbegriff

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef import (
    ErgebnisFormuliererAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef_data_format import (
    ErgebnisFormuliererAgentOutput,
)

_PATCH = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef.llm_invoke"


def _make_fully_interpreted_ur(begriff: str) -> UnbestimmterRechtsbegriff:
    return UnbestimmterRechtsbegriff(
        begriff=begriff,
        auslegungsvorschläge=[
            Auslegungsvorschlag(auslegung_methode="wortlaut", auslegungsvorschlag="Wortlaut-Auslegung"),
            Auslegungsvorschlag(auslegung_methode="systematik", auslegungsvorschlag="Systematik-Auslegung"),
            Auslegungsvorschlag(auslegung_methode="historie", auslegungsvorschlag="Historic-Auslegung"),
            Auslegungsvorschlag(auslegung_methode="telos", auslegungsvorschlag="Telos-Auslegung"),
        ],
    )


class TestErgebnisFormuliererAgentWorkflow:
    async def test_empty_input_returns_empty_list(self) -> None:
        """Tests if an empty input list returns an empty result without calling the LLM."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await ErgebnisFormuliererAgentWorkflow().run([])

        mock_llm.assert_not_called()
        assert result == []

    async def test_calls_llm_once_per_begriff(self) -> None:
        """Tests if the LLM is called exactly once per unbestimmter Rechtsbegriff."""
        ur_list = [_make_fully_interpreted_ur("Begriff A"), _make_fully_interpreted_ur("Begriff B")]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErgebnisFormuliererAgentOutput(auslegung="Zusammengeführte Auslegung.")
            await ErgebnisFormuliererAgentWorkflow().run(ur_list)

        assert mock_llm.call_count == 2

    async def test_sets_auslegung_on_result(self) -> None:
        """Tests if the auslegung text from the LLM is set on the result object."""
        ur = _make_fully_interpreted_ur("öffentliches Interesse")
        expected_auslegung = "Das öffentliche Interesse umfasst das Wohl der Allgemeinheit."
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErgebnisFormuliererAgentOutput(auslegung=expected_auslegung)
            result = await ErgebnisFormuliererAgentWorkflow().run([ur])

        assert result[0].auslegung == expected_auslegung

    async def test_preserves_begriff_in_result(self) -> None:
        """Tests if the Begriff is preserved unchanged in the result after auslegung."""
        ur = _make_fully_interpreted_ur("pflichtgemäßes Ermessen")
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErgebnisFormuliererAgentOutput(auslegung="Eine Auslegung.")
            result = await ErgebnisFormuliererAgentWorkflow().run([ur])

        assert result[0].begriff == "pflichtgemäßes Ermessen"

    @pytest.mark.parametrize("count", [1, 3, 5])
    async def test_output_count_matches_input(self, count: int) -> None:
        """Tests if the output count matches the parametrized number of input Rechtsbegriffe."""
        ur_list = [_make_fully_interpreted_ur(f"Begriff {i}") for i in range(count)]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErgebnisFormuliererAgentOutput(auslegung="Auslegung.")
            result = await ErgebnisFormuliererAgentWorkflow().run(ur_list)

        assert len(result) == count
