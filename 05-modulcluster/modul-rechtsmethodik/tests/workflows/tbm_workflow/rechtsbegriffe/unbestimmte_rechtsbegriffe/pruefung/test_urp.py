"""Tests for UnbestimmteRechtsbegriffePrueferAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.contracts import UnbestimmterRechtsbegriff

from src.activities.law_api_calls import DefinitionsByJurabkTitelOutput, LegaldefinitionOutput
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp import (
    UnbestimmteRechtsbegriffePrueferAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp_data_format import (
    PruefungEintrag,
    UnbestimmteRechtsbegriffePrueferAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_types import (
    UnbestimmteRechtsbegriffePrueferAgentInput,
)

_PATCH_LLM = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp.llm_invoke"
_PATCH_LD = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp.ld_table_get_definitions_by_jurabk_titel"
_PATCH_MATCH = (
    "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp.get_matching_legal_terms"
)


def _make_u_begriff(begriff: str) -> UnbestimmterRechtsbegriff:
    return UnbestimmterRechtsbegriff(begriff=begriff, auslegungsvorschläge=[])


@pytest.fixture
def workflow_input() -> UnbestimmteRechtsbegriffePrueferAgentInput:
    return UnbestimmteRechtsbegriffePrueferAgentInput(
        ure_output=[_make_u_begriff("öffentliches Interesse")],
        jurabk="BNatSchG",
    )


class TestUnbestimmteRechtsbegriffePrueferAgentWorkflow:
    async def test_empty_input_returns_empty_list(self) -> None:
        """Tests if an empty ure_output list returns an empty result."""
        empty_input = UnbestimmteRechtsbegriffePrueferAgentInput(ure_output=[], jurabk="BNatSchG")
        with patch(_PATCH_LD, new_callable=AsyncMock):
            result = await UnbestimmteRechtsbegriffePrueferAgentWorkflow().run(empty_input)

        assert result == []

    async def test_returns_all_terms_when_no_bestimmte_match(
        self, workflow_input: UnbestimmteRechtsbegriffePrueferAgentInput
    ) -> None:
        """Tests if all terms are returned unchanged when no bestimmte Rechtsbegriffe match is found."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[])
            result = await UnbestimmteRechtsbegriffePrueferAgentWorkflow().run(workflow_input)

        assert len(result) == 1
        assert result[0].begriff == "öffentliches Interesse"

    async def test_filters_out_terms_confirmed_as_bestimmt(
        self, workflow_input: UnbestimmteRechtsbegriffePrueferAgentInput
    ) -> None:
        """Tests if terms confirmed as bestimmt by the LLM are filtered out from the result."""
        matched = LegaldefinitionOutput(
            begriff="öffentliches Interesse",
            definition="Interesse der Allgemeinheit",
            paragraph_nr="1",
            jurabk="BNatSchG",
        )
        pruefung_output = UnbestimmteRechtsbegriffePrueferAgentOutput(
            pruefung=[PruefungEintrag(id="0", begriff="öffentliches Interesse", bestimmt=True, b_ids=["0"])]
        )
        with (
            patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld,
            patch(_PATCH_MATCH, return_value=iter([matched])),
            patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm,
        ):
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[matched])
            mock_llm.return_value = pruefung_output
            result = await UnbestimmteRechtsbegriffePrueferAgentWorkflow().run(workflow_input)

        assert result == []

    async def test_keeps_terms_confirmed_as_unbestimmt(
        self, workflow_input: UnbestimmteRechtsbegriffePrueferAgentInput
    ) -> None:
        """Tests if terms confirmed as unbestimmt by the LLM are kept in the result."""
        matched = LegaldefinitionOutput(
            begriff="öffentliches Interesse",
            definition="Interesse der Allgemeinheit",
            paragraph_nr="1",
            jurabk="BNatSchG",
        )
        pruefung_output = UnbestimmteRechtsbegriffePrueferAgentOutput(
            pruefung=[PruefungEintrag(id="0", begriff="öffentliches Interesse", bestimmt=False, b_ids=[])]
        )
        with (
            patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld,
            patch(_PATCH_MATCH, return_value=iter([matched])),
            patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm,
        ):
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[matched])
            mock_llm.return_value = pruefung_output
            result = await UnbestimmteRechtsbegriffePrueferAgentWorkflow().run(workflow_input)

        assert len(result) == 1
        assert result[0].begriff == "öffentliches Interesse"
