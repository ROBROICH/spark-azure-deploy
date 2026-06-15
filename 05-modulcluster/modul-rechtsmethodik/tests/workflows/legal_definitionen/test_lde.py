"""Tests for LegalDefinitionenExtrahiererAgent prompt selection."""

from unittest.mock import AsyncMock, patch

from src.workflows.legal_definitionen.erkennung.lde import LegalDefinitionenExtrahiererAgent
from src.workflows.legal_definitionen.erkennung.lde_data_format import (
    LegalDefinitionenExtrahiererAgentInput,
    LegalTermsList,
    LegalTermsListEntry,
)
from src.workflows.legal_definitionen.erkennung.lde_prompt import (
    lde_agent_allgemeiner_paragraph_prompt,
    lde_agent_begriffsbestimmungen_prompt,
)

_PATCH = "src.workflows.legal_definitionen.erkennung.lde.llm_invoke"


def _make_input(ist_begriffsbestimmungen: bool) -> LegalDefinitionenExtrahiererAgentInput:
    return LegalDefinitionenExtrahiererAgentInput(
        paragraph_text="§ 2 Begriffsbestimmungen. Anlage ist...",
        ist_begriffsbestimmungen=ist_begriffsbestimmungen,
    )


_EMPTY_OUTPUT = LegalTermsList(rechtsbegriffe=[])
_TERM = LegalTermsListEntry(begriff="Anlage", definition="Jede ortsfeste Einrichtung.")
_OUTPUT_WITH_TERM = LegalTermsList(rechtsbegriffe=[_TERM])


class TestLegalDefinitionenExtrahiererAgent:
    async def test_uses_begriffsbestimmungen_prompt_when_flag_true(self) -> None:
        """Tests if the begriffsbestimmungen prompt is used when ist_begriffsbestimmungen is True."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _EMPTY_OUTPUT
            await LegalDefinitionenExtrahiererAgent().run(_make_input(ist_begriffsbestimmungen=True))

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["prompt_template"] == lde_agent_begriffsbestimmungen_prompt

    async def test_uses_allgemeiner_prompt_when_flag_false(self) -> None:
        """Tests if the allgemeiner paragraph prompt is used when ist_begriffsbestimmungen is False."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _EMPTY_OUTPUT
            await LegalDefinitionenExtrahiererAgent().run(_make_input(ist_begriffsbestimmungen=False))

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["prompt_template"] == lde_agent_allgemeiner_paragraph_prompt

    async def test_prompts_differ(self) -> None:
        """Tests if the begriffsbestimmungen prompt and the allgemeiner paragraph prompt are distinct."""
        assert lde_agent_begriffsbestimmungen_prompt != lde_agent_allgemeiner_paragraph_prompt

    async def test_passes_paragraph_text_to_llm(self) -> None:
        """Tests if the paragraph_text is passed correctly to the LLM."""
        text = "§ 7 Begriffsbestimmungen. Anlage ist..."
        inp = LegalDefinitionenExtrahiererAgentInput(
            paragraph_text=text, ist_begriffsbestimmungen=True
        )
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _EMPTY_OUTPUT
            await LegalDefinitionenExtrahiererAgent().run(inp)

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["activity_input"]["input_dict"]["paragraph_text"] == text

    async def test_returns_rechtsbegriffe_list(self) -> None:
        """Tests if the agent returns a list of extracted Rechtsbegriffe."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _OUTPUT_WITH_TERM
            result = await LegalDefinitionenExtrahiererAgent().run(_make_input(True))

        assert len(result) == 1
        assert result[0].begriff == "Anlage"

    async def test_calls_llm_exactly_once(self) -> None:
        """Tests if the LLM is called exactly once per agent run."""
        with patch(_PATCH, new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = _EMPTY_OUTPUT
            await LegalDefinitionenExtrahiererAgent().run(_make_input(False))

        mock_llm.assert_called_once()
