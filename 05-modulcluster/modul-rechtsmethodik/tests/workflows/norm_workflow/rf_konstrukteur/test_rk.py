"""Tests for RechtsfolgeKonstrukteurAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.norm_workflow.norm_types import RechtsfolgeKonstrukteurAgentInput
from src.workflows.norm_workflow.rf_konstrukteur.rk import RechtsfolgeKonstrukteurAgentWorkflow
from src.workflows.norm_workflow.rf_konstrukteur.rk_data_format import RechtsfolgeKonstrukteurAgentOutput

_PATCH = "src.workflows.norm_workflow.rf_konstrukteur.rk.llm_invoke"


@pytest.fixture
def workflow_input() -> RechtsfolgeKonstrukteurAgentInput:
    return RechtsfolgeKonstrukteurAgentInput(
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        rechtsfolgen_raw=["bedarf einer Genehmigung"],
    )


class TestRechtsfolgeKonstrukteurAgentWorkflow:
    async def test_calls_llm_once(self, workflow_input: RechtsfolgeKonstrukteurAgentInput) -> None:
        """Tests if the LLM is called exactly once during Rechtsfolge construction."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgeKonstrukteurAgentOutput(
                rechtsfolge_neu="Der Betreiber bedarf einer Genehmigung."
            )
            await RechtsfolgeKonstrukteurAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_returns_rechtsfolge_neu_string(self, workflow_input: RechtsfolgeKonstrukteurAgentInput) -> None:
        """Tests if the workflow returns the reconstructed Rechtsfolge string from the LLM output."""
        expected = "Der Betreiber bedarf einer Genehmigung."
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgeKonstrukteurAgentOutput(rechtsfolge_neu=expected)
            result = await RechtsfolgeKonstrukteurAgentWorkflow().run(workflow_input)

        assert result == expected

    @pytest.mark.parametrize(
        "rechtsfolgen_raw",
        [
            ["bedarf einer Genehmigung"],
            ["wird mit Freiheitsstrafe bestraft", "oder mit Geldstrafe bestraft"],
        ],
    )
    async def test_passes_rechtsfolgen_raw_to_llm(self, rechtsfolgen_raw: list[str]) -> None:
        """Tests if the rechtsfolgen_raw list is correctly passed to the LLM input dict."""
        workflow_input = RechtsfolgeKonstrukteurAgentInput(
            satz_text="Ein Satz.",
            rechtsfolgen_raw=rechtsfolgen_raw,
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RechtsfolgeKonstrukteurAgentOutput(rechtsfolge_neu="Rekonstruierte Rechtsfolge.")
            await RechtsfolgeKonstrukteurAgentWorkflow().run(workflow_input)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["rechtsfolgen_raw"] == rechtsfolgen_raw
