"""Tests for SatzKategorieAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.norm_workflow.satz_kategorie.sk import SatzKategorieAgentWorkflow
from src.workflows.norm_workflow.satz_kategorie.sk_data_format import SatzKategorieAgentOutput

_PATCH = "src.workflows.norm_workflow.satz_kategorie.sk.llm_invoke"


class TestSatzKategorieAgentWorkflow:
    async def test_calls_llm_once(self) -> None:
        """Tests if the LLM is called exactly once during Satz-Kategorie classification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SatzKategorieAgentOutput(kategorie="wenn-dann")
            await SatzKategorieAgentWorkflow().run("Wer eine Anlage betreibt, bedarf einer Genehmigung.")

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "kategorie",
        ["wenn-dann", "abwägungsdirektive", "begriffserklärung", "sonstiges"],
    )
    async def test_returns_kategorie_from_llm(self, kategorie: str) -> None:
        """Tests if the Satz-Kategorie returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SatzKategorieAgentOutput(kategorie=kategorie)  # type: ignore[arg-type]
            result = await SatzKategorieAgentWorkflow().run("Ein Satz.")

        assert result == kategorie

    async def test_passes_satz_text_to_llm(self) -> None:
        """Tests if the satz_text is passed correctly to the LLM input dict."""
        satz = "Die Behörde hat nach Ermessen zu entscheiden."
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SatzKategorieAgentOutput(kategorie="wenn-dann")
            await SatzKategorieAgentWorkflow().run(satz)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["satz_text"] == satz
