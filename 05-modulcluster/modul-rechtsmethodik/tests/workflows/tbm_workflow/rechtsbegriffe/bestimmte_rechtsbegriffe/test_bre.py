"""Tests for BestimmteRechtsbegriffeErkennerAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest
from fixtures.bnatschg_44 import (
    BESONDERS_GESCHUETZTE_ARTEN_DEFINITION,
    SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE,
    SATZ_1_NR_1_TEXT,
)

from src.activities.law_api_calls import DefinitionsByJurabkTitelOutput, LegaldefinitionOutput
from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre import (
    BestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre_data_format import (
    BestimmteRechtsbegriffeErkennerAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_types import BestimmteRechtsbegriffeErkennerAgentInput

_PATCH_LLM = "src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre.llm_invoke"
_PATCH_LD = (
    "src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre.ld_table_get_definitions_by_jurabk_titel"
)


@pytest.fixture
def workflow_input() -> BestimmteRechtsbegriffeErkennerAgentInput:
    return BestimmteRechtsbegriffeErkennerAgentInput(
        jurabk="BNatSchG",
        satz_text="Die Anlage bedarf einer Genehmigung.",
        atomare_tatbestandsmerkmale=["Anlage ist vorhanden", "Genehmigung fehlt"],
    )


class TestBestimmteRechtsbegriffeErkennerAgentWorkflow:
    async def test_returns_empty_lists_when_no_matched_terms(
        self, workflow_input: BestimmteRechtsbegriffeErkennerAgentInput
    ) -> None:
        """Tests if empty lists are returned when no legal definitions match the TBMs."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[])
            result = await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(workflow_input)

        assert result == [[], []]

    async def test_skips_llm_when_no_matched_terms(
        self, workflow_input: BestimmteRechtsbegriffeErkennerAgentInput
    ) -> None:
        """Tests if the LLM is not called when no legal definitions match the TBMs."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld, patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[])
            await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(workflow_input)

        mock_llm.assert_not_called()

    async def test_calls_llm_when_matched_terms_exist(
        self, workflow_input: BestimmteRechtsbegriffeErkennerAgentInput
    ) -> None:
        """Tests if the LLM is called when at least one legal definition matches the TBMs."""
        matched = LegaldefinitionOutput(
            begriff="Genehmigung",
            definition="Amtliche Erlaubnis",
            paragraph_nr="4",
            jurabk="BImSchG",
        )
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld, patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[matched])
            mock_llm.return_value = BestimmteRechtsbegriffeErkennerAgentOutput(begriffe=["0"])
            await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(workflow_input)

        mock_llm.assert_called_once()

    async def test_output_has_one_list_per_tbm(self, workflow_input: BestimmteRechtsbegriffeErkennerAgentInput) -> None:
        """Tests if the output contains exactly one list per atomare Tatbestandsmerkmal."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[])
            result = await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(workflow_input)

        assert len(result) == len(workflow_input.atomare_tatbestandsmerkmale)


class TestBestimmteRechtsbegriffeWithRealData:
    """Tests using real BNatSchG § 44 production data."""

    @pytest.fixture
    def bnatschg_input(self) -> BestimmteRechtsbegriffeErkennerAgentInput:
        return BestimmteRechtsbegriffeErkennerAgentInput(
            jurabk="BNatSchG",
            satz_text=SATZ_1_NR_1_TEXT,
            atomare_tatbestandsmerkmale=SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE,
        )

    @pytest.fixture
    def bnatschg_definition(self) -> LegaldefinitionOutput:
        return LegaldefinitionOutput(
            begriff=BESONDERS_GESCHUETZTE_ARTEN_DEFINITION.begriff,
            definition=BESONDERS_GESCHUETZTE_ARTEN_DEFINITION.definition,
            jurabk=BESONDERS_GESCHUETZTE_ARTEN_DEFINITION.source.jurabk,
            paragraph_nr=BESONDERS_GESCHUETZTE_ARTEN_DEFINITION.source.paragraph_nr,
        )

    async def test_output_length_matches_atomare_tbm_count(
        self,
        bnatschg_input: BestimmteRechtsbegriffeErkennerAgentInput,
        bnatschg_definition: LegaldefinitionOutput,
    ) -> None:
        """Tests if the output length matches the count of real BNatSchG § 44 atomare TBMs."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld, patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[bnatschg_definition])
            mock_llm.return_value = BestimmteRechtsbegriffeErkennerAgentOutput(begriffe=["0"])
            result = await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(bnatschg_input)

        assert len(result) == len(SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE)

    async def test_llm_called_when_besonders_geschuetzte_arten_present(
        self,
        bnatschg_input: BestimmteRechtsbegriffeErkennerAgentInput,
        bnatschg_definition: LegaldefinitionOutput,
    ) -> None:
        """Tests if the LLM is called when the 'besonders geschützte Arten' definition is present."""
        with patch(_PATCH_LD, new_callable=AsyncMock) as mock_ld, patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm:
            mock_ld.return_value = DefinitionsByJurabkTitelOutput(definitions=[bnatschg_definition])
            mock_llm.return_value = BestimmteRechtsbegriffeErkennerAgentOutput(begriffe=["0"])
            await BestimmteRechtsbegriffeErkennerAgentWorkflow().run(bnatschg_input)

        mock_llm.assert_called_once()
