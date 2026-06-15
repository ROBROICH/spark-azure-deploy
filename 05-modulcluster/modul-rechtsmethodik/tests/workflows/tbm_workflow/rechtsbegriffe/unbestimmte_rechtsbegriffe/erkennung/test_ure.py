# ruff: noqa: PLR2004
"""Tests for UnbestimmteRechtsbegriffeErkennerAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from fixtures.bnatschg_44 import SATZ_1_NR_2_TEXT

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure import (
    UnbestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure_data_format import (
    UnbestimmteRechtsbegriffeErkennerAgentOutput,
)

_PATCH = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure.llm_invoke"

_SATZ = "Die Behörde entscheidet nach pflichtgemäßem Ermessen im öffentlichen Interesse."


class TestUnbestimmteRechtsbegriffeErkennerAgentWorkflow:
    async def test_calls_llm_once(self) -> None:
        """Tests if the LLM is called exactly once during unbestimmte Rechtsbegriffe recognition."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(
                unbestimmte_rechtsbegriffe=["öffentliches Interesse"]
            )
            await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(_SATZ)

        mock_llm.assert_called_once()

    async def test_maps_strings_to_unbestimmter_rechtsbegriff_objects(self) -> None:
        """Tests if the LLM output strings are mapped to UnbestimmterRechtsbegriff objects."""
        begriffe = ["öffentliches Interesse", "pflichtgemäßes Ermessen"]
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(unbestimmte_rechtsbegriffe=begriffe)
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(_SATZ)

        assert len(result) == 2
        assert result[0].begriff == "öffentliches Interesse"
        assert result[1].begriff == "pflichtgemäßes Ermessen"

    async def test_auslegungsvorschlaege_is_empty_list(self) -> None:
        """Tests if newly created UnbestimmterRechtsbegriff objects have an empty auslegungsvorschläge list."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(
                unbestimmte_rechtsbegriffe=["öffentliches Interesse"]
            )
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(_SATZ)

        assert result[0].auslegungsvorschläge == []

    async def test_empty_llm_output_returns_empty_list(self) -> None:
        """Tests if an empty LLM output list results in an empty workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(unbestimmte_rechtsbegriffe=[])
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(_SATZ)

        assert result == []

    @pytest.mark.parametrize(
        "begriffe",
        [
            ["öffentliches Interesse"],
            ["pflichtgemäßes Ermessen", "öffentliches Interesse"],
            ["geeignet", "erforderlich", "angemessen"],
        ],
    )
    async def test_count_matches_llm_output(self, begriffe: list[str]) -> None:
        """Tests if the number of returned objects matches the number of begriffe in the LLM output."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(unbestimmte_rechtsbegriffe=begriffe)
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(_SATZ)

        assert len(result) == len(begriffe)


class TestUnbestimmteRechtsbegriffeErkennerWithRealData:
    """Tests using real BNatSchG § 44 Abs. 1 Nr. 2 production data."""

    async def test_erkennt_erhebliche_stoerung(self) -> None:
        """Tests if 'erhebliche Störung' is correctly recognized as an unbestimmter Rechtsbegriff."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(
                unbestimmte_rechtsbegriffe=["erhebliche Störung"]
            )
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(SATZ_1_NR_2_TEXT)

        assert result[0].begriff == "erhebliche Störung"

    async def test_erhebliche_stoerung_has_empty_auslegungsvorschlaege(self) -> None:
        """Tests if the recognized 'erhebliche Störung' has an empty auslegungsvorschläge list."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UnbestimmteRechtsbegriffeErkennerAgentOutput(
                unbestimmte_rechtsbegriffe=["erhebliche Störung"]
            )
            result = await UnbestimmteRechtsbegriffeErkennerAgentWorkflow().run(SATZ_1_NR_2_TEXT)

        assert result[0].auslegungsvorschläge == []
