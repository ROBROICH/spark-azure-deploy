"""Tests for SollensanordnungsAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.rf_workflow.sollensanordnungen.sa import SollensanordnungsAgentWorkflow
from src.workflows.rf_workflow.sollensanordnungen.sa_data_format import SollensanordnungenAgentOutputFormat

_PATCH = "src.workflows.rf_workflow.sollensanordnungen.sa.llm_invoke"


class TestSollensanordnungsAgentWorkflow:
    async def test_calls_llm_once(self, rechtsfolge_text: str) -> None:
        """Tests if the LLM is called exactly once during Sollensanordnung classification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SollensanordnungenAgentOutputFormat(kategorie="erlaubnis")
            await SollensanordnungsAgentWorkflow().run(rechtsfolge_text)

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "kategorie",
        ["verbot", "gebot", "erlaubnis", "freistellung"],
    )
    async def test_returns_sollensanordnung_from_llm(self, kategorie: str, rechtsfolge_text: str) -> None:
        """Tests if the Sollensanordnung category returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SollensanordnungenAgentOutputFormat(kategorie=kategorie)  # type: ignore[arg-type]
            result = await SollensanordnungsAgentWorkflow().run(rechtsfolge_text)

        assert result == kategorie

    async def test_passes_rechtsfolge_to_llm(self, rechtsfolge_text: str) -> None:
        """Tests if the rechtsfolge text is passed correctly to the LLM input dict."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = SollensanordnungenAgentOutputFormat(kategorie="gebot")
            await SollensanordnungsAgentWorkflow().run(rechtsfolge_text)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["rechtsfolge"] == rechtsfolge_text
