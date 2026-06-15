"""Tests for RechtsfolgenAdressatenAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra import (
    RechtsfolgenAdressatenAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra_data_format import (
    RechtsfolgenAdressatenAgentOutputFormat,
)

_PATCH = "src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra.llm_invoke"


class TestRechtsfolgenAdressatenAgentWorkflow:
    async def test_calls_llm_once(self, rechtsfolge_text: str) -> None:
        """Tests if the LLM is called exactly once during Rechtsfolgen-Adressat classification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgenAdressatenAgentOutputFormat(entscheidung="handlungsermächtigung")
            await RechtsfolgenAdressatenAgentWorkflow().run(rechtsfolge_text)

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "adressat",
        ["handlungsermächtigung", "keine handlungsermächtigung"],
    )
    async def test_returns_adressat_from_llm(self, adressat: str, rechtsfolge_text: str) -> None:
        """Tests if the Rechtsfolgen-Adressat returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgenAdressatenAgentOutputFormat(entscheidung=adressat)  # type: ignore[arg-type]
            result = await RechtsfolgenAdressatenAgentWorkflow().run(rechtsfolge_text)

        assert result == adressat

    async def test_passes_rechtsfolge_to_llm(self, rechtsfolge_text: str) -> None:
        """Tests if the rechtsfolge text is passed correctly to the LLM input dict."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgenAdressatenAgentOutputFormat(entscheidung="keine handlungsermächtigung")
            await RechtsfolgenAdressatenAgentWorkflow().run(rechtsfolge_text)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["rechtsfolge"] == rechtsfolge_text
