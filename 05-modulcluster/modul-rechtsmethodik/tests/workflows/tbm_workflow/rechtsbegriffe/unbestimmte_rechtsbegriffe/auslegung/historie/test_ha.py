"""Tests for HistorieAuslegerAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    AuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha import (
    HistorieAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha_data_format import (
    HistorieAuslegerAgentOutput,
)

_PATCH = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha.llm_invoke"

_FALLBACK_TEXT = (
    "Die semantische Suche hat keine einschlägigen Materialien zur "
    "historischen Auslegung des unbestimmten Rechtsbegriffs identifiziert "
    "und war in diesem Sinne unergiebig."
)


@pytest.fixture
def ausleger_input_empty(u_begriff_with_context: UnbestimmterRechtsbegriffWithContext) -> AuslegerAgentInput:
    empty = u_begriff_with_context.model_copy(update={"u_context": [], "d_context": []})
    return AuslegerAgentInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        markers=["§ 44 Abs. 1 S. 1"],
        satz_text="Die Behörde entscheidet im öffentlichen Interesse.",
        enriched_urp=[empty],
    )


@pytest.fixture
def ausleger_input_with_context(u_begriff_with_context: UnbestimmterRechtsbegriffWithContext) -> AuslegerAgentInput:
    return AuslegerAgentInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        markers=["§ 44 Abs. 1 S. 1"],
        satz_text="Die Behörde entscheidet im öffentlichen Interesse.",
        enriched_urp=[u_begriff_with_context],
    )


class TestHistorieAuslegerAgentWorkflow:
    async def test_empty_enriched_urp_returns_empty_list(self) -> None:
        """Tests if an empty enriched_urp list returns an empty result without calling the LLM."""
        input_empty = AuslegerAgentInput(
            jurabk="BNatSchG",
            paragraph_nr="44",
            absatz_nr="1",
            satz_nr="1",
            markers=[],
            satz_text="Ein Satz.",
            enriched_urp=[],
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await HistorieAuslegerAgentWorkflow().run(input_empty)

        mock_llm.assert_not_called()
        assert result == []

    async def test_uses_fallback_when_no_context(self, ausleger_input_empty: AuslegerAgentInput) -> None:
        """Tests if the fallback text is used when no historical context is available."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await HistorieAuslegerAgentWorkflow().run(ausleger_input_empty)

        mock_llm.assert_not_called()
        assert result[0].auslegungsvorschläge[0].auslegungsvorschlag == _FALLBACK_TEXT

    async def test_calls_llm_when_context_present(self, ausleger_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the LLM is called when historical context is present in the input."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = HistorieAuslegerAgentOutput(
                historische_auslegung="Historische Bedeutung des Begriffs."
            )
            result = await HistorieAuslegerAgentWorkflow().run(ausleger_input_with_context)

        mock_llm.assert_called_once()
        assert result[0].auslegungsvorschläge[0].auslegung_methode == "historie"

    async def test_auslegungsmethode_is_historie(self, ausleger_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the auslegung_methode is set to 'historie' in the result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = HistorieAuslegerAgentOutput(historische_auslegung="Eine Auslegung.")
            result = await HistorieAuslegerAgentWorkflow().run(ausleger_input_with_context)

        assert result[0].auslegungsvorschläge[0].auslegung_methode == "historie"
