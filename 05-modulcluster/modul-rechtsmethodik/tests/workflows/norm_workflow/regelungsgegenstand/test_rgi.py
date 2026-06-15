"""Tests for RegelungsgegenstandsIdentifikatorAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowInput
from src.workflows.norm_workflow.regelungsgegenstand.rgi import RegelungsgegenstandsIdentifikatorAgentWorkflow
from src.workflows.norm_workflow.regelungsgegenstand.rgi_data_format import RegelungsgegenstandsIdentifikatorOutput

_PATCH = "src.workflows.norm_workflow.regelungsgegenstand.rgi.llm_invoke"


@pytest.fixture
def norm_input_with_text() -> NormDekonstruktionWorkflowInput:
    return NormDekonstruktionWorkflowInput(
        gesetz="BImSchG",
        jurabk="BImSchG",
        standangaben=[],
        paragraph_nr="4",
        paragraph_titel="Genehmigung",
        paragraph_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        absaetze=[],
    )


@pytest.fixture
def norm_input_empty_text() -> NormDekonstruktionWorkflowInput:
    return NormDekonstruktionWorkflowInput(
        gesetz="BImSchG",
        jurabk="BImSchG",
        standangaben=[],
        paragraph_nr="4",
        paragraph_titel="Genehmigung",
        paragraph_text="",
        absaetze=[],
    )


class TestRegelungsgegenstandsIdentifikatorAgentWorkflow:
    async def test_calls_llm_when_paragraph_text_present(
        self, norm_input_with_text: NormDekonstruktionWorkflowInput
    ) -> None:
        """Tests if the LLM is called when paragraph_text is non-empty."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RegelungsgegenstandsIdentifikatorOutput(
                regelungsgegenstand="Genehmigungspflicht für Anlagen"
            )
            await RegelungsgegenstandsIdentifikatorAgentWorkflow().run(norm_input_with_text)

        mock_llm.assert_called_once()

    async def test_returns_regelungsgegenstand_string(
        self, norm_input_with_text: NormDekonstruktionWorkflowInput
    ) -> None:
        """Tests if the workflow returns the Regelungsgegenstand string from the LLM output."""
        expected = "Genehmigungspflicht für Anlagen"
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = RegelungsgegenstandsIdentifikatorOutput(regelungsgegenstand=expected)
            result = await RegelungsgegenstandsIdentifikatorAgentWorkflow().run(norm_input_with_text)

        assert result == expected

    async def test_returns_none_when_paragraph_text_empty(
        self, norm_input_empty_text: NormDekonstruktionWorkflowInput
    ) -> None:
        """Tests if the workflow returns None and skips the LLM when paragraph_text is empty."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await RegelungsgegenstandsIdentifikatorAgentWorkflow().run(norm_input_empty_text)

        mock_llm.assert_not_called()
        assert result is None

    @pytest.mark.parametrize(
        "paragraph_text",
        [""],
    )
    async def test_returns_none_for_empty_paragraph_text(self, paragraph_text: str) -> None:
        """Tests if the workflow returns None for any empty paragraph_text without calling the LLM."""
        norm_input = NormDekonstruktionWorkflowInput(
            gesetz="TestG",
            jurabk="TestG",
            standangaben=[],
            paragraph_nr="1",
            paragraph_titel="Test",
            paragraph_text=paragraph_text,
            absaetze=[],
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await RegelungsgegenstandsIdentifikatorAgentWorkflow().run(norm_input)

        mock_llm.assert_not_called()
        assert result is None
