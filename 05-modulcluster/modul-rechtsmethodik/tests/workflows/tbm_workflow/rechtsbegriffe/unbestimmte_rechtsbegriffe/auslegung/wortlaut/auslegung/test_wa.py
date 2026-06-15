"""Tests for WortlautAuslegerAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa import (
    WortlautAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa_data_format import (
    WortlautAuslegerAgentOutput,
    WortlautAuslegerUnbestimmterRechtsbegriff,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow_types import (
    WortlautAuslegerAgentInput,
    WortlautProcessor,
)

_PATCH = (
    "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa.llm_invoke"
)


def _make_processor(id: str, begriff: str) -> WortlautProcessor:
    return WortlautProcessor(
        id=id,
        u_begriff=begriff,
        meanings_dict={"öffentlich": ["pertaining to the public"]},
        wiki_source_dict={"öffentlich": "https://en.wiktionary.org/..."},
    )


def _make_auslegung_output(count: int) -> WortlautAuslegerAgentOutput:
    return WortlautAuslegerAgentOutput(
        wortlaut_auslegung=[
            WortlautAuslegerUnbestimmterRechtsbegriff(id=str(i), u_begriff=f"Begriff {i}", auslegung=f"Auslegung {i}")
            for i in range(count)
        ]
    )


@pytest.fixture
def workflow_input() -> WortlautAuslegerAgentInput:
    return WortlautAuslegerAgentInput(
        satz_text="Die Behörde entscheidet im öffentlichen Interesse.",
        paragraph_text="§ 1 Zweck des Gesetzes.",
        u_rechtsbegriffe=[_make_processor("0", "öffentliches Interesse")],
    )


class TestWortlautAuslegerAgentWorkflow:
    async def test_calls_llm_once(self, workflow_input: WortlautAuslegerAgentInput) -> None:
        """Tests if the LLM is called exactly once during wortlaut auslegung."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_auslegung_output(1)
            await WortlautAuslegerAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_returns_auslegung_list(self, workflow_input: WortlautAuslegerAgentInput) -> None:
        """Tests if the workflow returns a list of auslegung results with the correct text."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_auslegung_output(1)
            result = await WortlautAuslegerAgentWorkflow().run(workflow_input)

        assert len(result) == 1
        assert result[0].auslegung == "Auslegung 0"

    @pytest.mark.parametrize("count", [1, 2, 3])
    async def test_output_count_matches_input(self, count: int) -> None:
        """Tests if the output auslegung count matches the parametrized number of input Rechtsbegriffe."""
        workflow_input = WortlautAuslegerAgentInput(
            satz_text="Ein Satz.",
            paragraph_text="Ein Paragraphentext.",
            u_rechtsbegriffe=[_make_processor(str(i), f"Begriff {i}") for i in range(count)],
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _make_auslegung_output(count)
            result = await WortlautAuslegerAgentWorkflow().run(workflow_input)

        assert len(result) == count
