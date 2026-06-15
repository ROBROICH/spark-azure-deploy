# ruff: noqa: PLR2004
"""Tests for UrteilKlassifikationAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    AuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk import (
    UrteilKlassifikationAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk_data_format import (
    AUSLEGUNGS_METHODEN,
    UrteilKlassifikation,
    UrteilKlassifikationOutput,
)

_PATCH = (
    "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk.llm_invoke"
)


@pytest.fixture
def uk_input_no_context(u_begriff_with_context: UnbestimmterRechtsbegriffWithContext) -> AuslegerAgentInput:
    empty = u_begriff_with_context.model_copy(update={"u_context": []})
    return AuslegerAgentInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        markers=[],
        satz_text="Ein Satz.",
        enriched_urp=[empty],
    )


@pytest.fixture
def uk_input_with_context(u_begriff_with_context: UnbestimmterRechtsbegriffWithContext) -> AuslegerAgentInput:
    return AuslegerAgentInput(
        jurabk="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        markers=[],
        satz_text="Die Behörde handelt im öffentlichen Interesse.",
        enriched_urp=[u_begriff_with_context],
    )


class TestUrteilKlassifikationAgentWorkflow:
    async def test_empty_context_returns_empty_method_dict(self, uk_input_no_context: AuslegerAgentInput) -> None:
        """Tests if empty context results in empty lists for all auslegungs methods without calling the LLM."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            result = await UrteilKlassifikationAgentWorkflow().run(uk_input_no_context)

        mock_llm.assert_not_called()
        assert all(result[0][m] == [] for m in AUSLEGUNGS_METHODEN)

    async def test_calls_llm_when_context_present(self, uk_input_with_context: AuslegerAgentInput) -> None:
        """Tests if the LLM is called when context chunks are present in the input."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UrteilKlassifikationOutput(
                klassifikationen=[
                    UrteilKlassifikation(
                        aktenzeichen="7 C 1/22",
                        randnummer="1",
                        methoden=["telos"],
                    )
                ]
            )
            await UrteilKlassifikationAgentWorkflow().run(uk_input_with_context)

        mock_llm.assert_called_once()

    async def test_groups_chunks_by_auslegungsmethode(self, uk_input_with_context: AuslegerAgentInput) -> None:
        """Tests if chunks are correctly grouped by their assigned auslegungs method."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UrteilKlassifikationOutput(
                klassifikationen=[
                    UrteilKlassifikation(
                        aktenzeichen="7 C 1/22",
                        randnummer="1",
                        methoden=["telos", "wortlaut"],
                    )
                ]
            )
            result = await UrteilKlassifikationAgentWorkflow().run(uk_input_with_context)

        assert len(result[0]["telos"]) == 1
        assert len(result[0]["wortlaut"]) == 1

    async def test_unmentioned_methods_have_empty_lists(self, uk_input_with_context: AuslegerAgentInput) -> None:
        """Tests if auslegungs methods not mentioned in any classification result in empty lists."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UrteilKlassifikationOutput(
                klassifikationen=[UrteilKlassifikation(aktenzeichen="7 C 1/22", randnummer="1", methoden=["telos"])]
            )
            result = await UrteilKlassifikationAgentWorkflow().run(uk_input_with_context)

        assert result[0]["systematik"] == []
        assert result[0]["historie"] == []

    @pytest.mark.parametrize("methode", AUSLEGUNGS_METHODEN)
    async def test_each_auslegungsmethode_can_be_assigned(
        self, uk_input_with_context: AuslegerAgentInput, methode: str
    ) -> None:
        """Tests if each auslegungs method can be assigned at least one chunk."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UrteilKlassifikationOutput(
                klassifikationen=[
                    UrteilKlassifikation(aktenzeichen="7 C 1/22", randnummer="1", methoden=[methode])  # type: ignore[list-item]
                ]
            )
            result = await UrteilKlassifikationAgentWorkflow().run(uk_input_with_context)

        assert len(result[0][methode]) == 1  # type: ignore[literal-required]

    async def test_unknown_chunk_in_llm_response_is_skipped(self, uk_input_with_context: AuslegerAgentInput) -> None:
        """If LLM returns a chunk not in the input, it's silently skipped."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = UrteilKlassifikationOutput(
                klassifikationen=[
                    UrteilKlassifikation(aktenzeichen="7 C 1/22", randnummer="1", methoden=["telos"]),
                    # This chunk doesn't exist in input:
                    UrteilKlassifikation(aktenzeichen="UNKNOWN/99", randnummer="99", methoden=["wortlaut"]),
                ]
            )
            result = await UrteilKlassifikationAgentWorkflow().run(uk_input_with_context)

        assert len(result[0]["telos"]) == 1
        assert result[0]["wortlaut"] == []  # unknown chunk was skipped

    async def test_multiple_rechtsbegriffe_classified_independently(
        self, u_begriff_with_context: UnbestimmterRechtsbegriffWithContext
    ) -> None:
        """Each Rechtsbegriff gets its own classification and grouping."""
        begriff_a = u_begriff_with_context.model_copy(update={"begriff": "Begriff A"})
        begriff_b = u_begriff_with_context.model_copy(update={"begriff": "Begriff B"})
        input_data = AuslegerAgentInput(
            jurabk="BNatSchG",
            paragraph_nr="44",
            absatz_nr="1",
            satz_nr="1",
            markers=[],
            satz_text="Ein Satz.",
            enriched_urp=[begriff_a, begriff_b],
        )

        mock_output = UrteilKlassifikationOutput(
            klassifikationen=[UrteilKlassifikation(aktenzeichen="7 C 1/22", randnummer="1", methoden=["wortlaut"])]
        )

        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_output
            result = await UrteilKlassifikationAgentWorkflow().run(input_data)

        assert len(result) == 2
        assert len(result[0]["wortlaut"]) == 1
        assert len(result[1]["wortlaut"]) == 1
