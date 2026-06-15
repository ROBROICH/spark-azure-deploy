"""Tests for ErmessensIdentifikationsAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei import (
    ErmessensIdentifikationsAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei_data_format import (
    ErmessensspielraumAgentOutputFormat,
)

_PATCH = "src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei.llm_invoke"


class TestErmessensIdentifikationsAgentWorkflow:
    async def test_calls_llm_once(self, rechtsfolge_text: str) -> None:
        """Tests if the LLM is called exactly once during Ermessensspielraum identification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensspielraumAgentOutputFormat(entscheidung="ermessensentscheidung")
            await ErmessensIdentifikationsAgentWorkflow().run(rechtsfolge_text)

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "ermessen",
        ["ermessensentscheidung", "gebundene entscheidung"],
    )
    async def test_returns_ermessensspielraum_from_llm(self, ermessen: str, rechtsfolge_text: str) -> None:
        """Tests if the Ermessensspielraum returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensspielraumAgentOutputFormat(entscheidung=ermessen)  # type: ignore[arg-type]
            result = await ErmessensIdentifikationsAgentWorkflow().run(rechtsfolge_text)

        assert result == ermessen

    async def test_passes_rechtsfolge_to_llm(self, rechtsfolge_text: str) -> None:
        """Tests if the rechtsfolge text is passed correctly to the LLM input dict."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = ErmessensspielraumAgentOutputFormat(entscheidung="gebundene entscheidung")
            await ErmessensIdentifikationsAgentWorkflow().run(rechtsfolge_text)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["rechtsfolge"] == rechtsfolge_text
