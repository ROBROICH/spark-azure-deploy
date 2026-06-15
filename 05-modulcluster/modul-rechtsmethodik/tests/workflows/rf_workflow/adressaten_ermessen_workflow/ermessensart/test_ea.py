"""Tests for ErmessensArtAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea import ErmessensArtAgentWorkflow
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea_data_format import (
    ErmessensArtAgentOutputFormat,
)

_PATCH = "src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea.llm_invoke"


class TestErmessensArtAgentWorkflow:
    async def test_calls_llm_once(self, rechtsfolge_text: str) -> None:
        """Tests if the LLM is called exactly once during Ermessensart classification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensArtAgentOutputFormat(entscheidung="auswahlermessen")
            await ErmessensArtAgentWorkflow().run(rechtsfolge_text)

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "ermessensart",
        ["entschließungsermessen", "auswahlermessen", "beides"],
    )
    async def test_returns_ermessensart_from_llm(self, ermessensart: str, rechtsfolge_text: str) -> None:
        """Tests if the Ermessensart returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensArtAgentOutputFormat(entscheidung=ermessensart)  # type: ignore[arg-type]
            result = await ErmessensArtAgentWorkflow().run(rechtsfolge_text)

        assert result == ermessensart

    async def test_passes_rechtsfolge_to_llm(self, rechtsfolge_text: str) -> None:
        """Tests if the rechtsfolge text is passed correctly to the LLM input dict."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensArtAgentOutputFormat(entscheidung="auswahlermessen")
            await ErmessensArtAgentWorkflow().run(rechtsfolge_text)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["rechtsfolge"] == rechtsfolge_text
