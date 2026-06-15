"""Tests for NormTypAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.norm_workflow.normtyp.nt import NormTypAgentWorkflow
from src.workflows.norm_workflow.normtyp.nt_data_format import NormTypAgentOutput

_PATCH = "src.workflows.norm_workflow.normtyp.nt.llm_invoke"


class TestNormTypAgentWorkflow:
    async def test_calls_llm_once(self) -> None:
        """Tests if the LLM is called exactly once during norm type classification."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = NormTypAgentOutput(norm_typ="materiell-rechtlich")
            await NormTypAgentWorkflow().run("Wer eine Anlage betreibt, bedarf einer Genehmigung.")

        mock_llm.assert_called_once()

    @pytest.mark.parametrize(
        "norm_typ",
        ["materiell-rechtlich", "verfahrensrechtlich"],
    )
    async def test_returns_norm_typ_from_llm(self, norm_typ: str) -> None:
        """Tests if the norm type returned by the LLM is passed through as the workflow result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = NormTypAgentOutput(norm_typ=norm_typ)  # type: ignore[arg-type]
            result = await NormTypAgentWorkflow().run("Beliebiger Satz.")

        assert result == norm_typ

    async def test_passes_satz_text_to_llm(self) -> None:
        """Tests if the satz_text is passed correctly to the LLM input dict."""
        satz = "Der Antrag ist schriftlich zu stellen."
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = NormTypAgentOutput(norm_typ="verfahrensrechtlich")
            await NormTypAgentWorkflow().run(satz)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["satz_text"] == satz
