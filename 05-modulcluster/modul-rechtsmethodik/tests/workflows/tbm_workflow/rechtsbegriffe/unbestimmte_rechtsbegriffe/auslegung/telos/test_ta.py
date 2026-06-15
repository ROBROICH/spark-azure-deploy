"""Tests for TelosAuslegerAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    AuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.telos.ta import (
    TelosAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.telos.ta_data_format import (
    TelosAuslegerAgentOutput,
)

_PATCH = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.telos.ta.llm_invoke"

_FALLBACK_TEXT = (
    "Die semantische Suche hat keine einschlägigen Urteile zur "
    "teleologischen Auslegung des unbestimmten Rechtsbegriffs identifiziert "
    "und war in diesem Sinne unergiebig."
)


@pytest.fixture
def ausleger_input_no_context(u_begriff_with_context: UnbestimmterRechtsbegriffWithContext) -> AuslegerAgentInput:
    empty = u_begriff_with_context.model_copy(update={"u_context": []})
    return AuslegerAgentInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        markers=["§ 44 Abs. 1 S. 1"],
        satz_text="Die Behörde handelt im öffentlichen Interesse.",
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
        satz_text="Die Behörde handelt im öffentlichen Interesse.",
        enriched_urp=[u_begriff_with_context],
    )


class TestTelosAuslegerAgentWorkflow:
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
            result = await TelosAuslegerAgentWorkflow().run(input_empty)

        mock_llm.assert_not_called()
        assert result == []

    async def test_uses_fallback_when_no_u_context(self, ausleger_input_no_context: AuslegerAgentInput) -> None:
        """Tests if the fallback text is used when no teleological context is available."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await TelosAuslegerAgentWorkflow().run(ausleger_input_no_context)

        mock_llm.assert_not_called()
        assert result[0].auslegungsvorschläge[0].auslegungsvorschlag == _FALLBACK_TEXT

    async def test_calls_llm_when_u_context_present(self, ausleger_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the LLM is called when teleological context is present in the input."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = TelosAuslegerAgentOutput(
                teleologische_auslegung="Teleologische Auslegung des Begriffs."
            )
            await TelosAuslegerAgentWorkflow().run(ausleger_input_with_context)

        mock_llm.assert_called_once()

    async def test_auslegungsmethode_is_telos(self, ausleger_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the auslegung_methode is set to 'telos' in the result."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = TelosAuslegerAgentOutput(teleologische_auslegung="Eine Auslegung.")
            result = await TelosAuslegerAgentWorkflow().run(ausleger_input_with_context)

        assert result[0].auslegungsvorschläge[0].auslegung_methode == "telos"

    async def test_preserves_begriff(self, ausleger_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the Begriff is preserved unchanged in the result after telos auslegung."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = TelosAuslegerAgentOutput(teleologische_auslegung="Eine Auslegung.")
            result = await TelosAuslegerAgentWorkflow().run(ausleger_input_with_context)

        assert result[0].begriff == "öffentliches Interesse"
