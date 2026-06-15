# ruff: noqa: PLR2004
"""Tests for WortlautWordExtractorAgentWorkflow."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we import (
    WortlautWordExtractorAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we_data_format import (
    WordExtractorOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow_types import (
    WortlautProcessor,
)

_PATCH_LLM = (
    "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we.llm_invoke"
)
_PATCH_WIKI = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we.get_wiktionary_meaning"
_PATCH_ENV = "src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we.ENV"


def _make_processor(id: str, begriff: str) -> WortlautProcessor:
    return WortlautProcessor(id=id, u_begriff=begriff)


class TestWortlautWordExtractorAgentWorkflow:
    async def test_calls_llm_once_per_processor(self) -> None:
        """Tests if the LLM is called exactly once per WortlautProcessor when Wiktionary is disabled."""
        processors = [_make_processor("0", "öffentliches Interesse"), _make_processor("1", "geeignet")]
        with patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm, patch(_PATCH_ENV) as mock_env:
            mock_env.WIKTIONARY.ENABLED = False
            mock_llm.return_value = WordExtractorOutput(extracted_words=["öffentlich"])
            await WortlautWordExtractorAgentWorkflow().run(processors)

        assert mock_llm.call_count == 2

    async def test_populates_meanings_dict_when_wiktionary_disabled(self) -> None:
        """Tests if extracted words are populated in meanings_dict with empty lists when Wiktionary is disabled."""
        processor = _make_processor("0", "öffentliches Interesse")
        with patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm, patch(_PATCH_ENV) as mock_env:
            mock_env.WIKTIONARY.ENABLED = False
            mock_llm.return_value = WordExtractorOutput(extracted_words=["öffentlich"])
            result = await WortlautWordExtractorAgentWorkflow().run([processor])

        assert "öffentlich" in result[0].meanings_dict
        assert result[0].meanings_dict["öffentlich"] == []

    async def test_does_not_call_wiktionary_when_disabled(self) -> None:
        """Tests if the Wiktionary lookup is not called when Wiktionary is disabled in the environment."""
        processor = _make_processor("0", "öffentliches Interesse")
        with (
            patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm,
            patch(_PATCH_WIKI, new_callable=AsyncMock) as mock_wiki,
            patch(_PATCH_ENV) as mock_env,
        ):
            mock_env.WIKTIONARY.ENABLED = False
            mock_llm.return_value = WordExtractorOutput(extracted_words=["öffentlich"])
            await WortlautWordExtractorAgentWorkflow().run([processor])

        mock_wiki.assert_not_called()

    async def test_empty_input_returns_empty_list(self) -> None:
        """Tests if an empty processors list returns an empty result without calling the LLM."""
        with patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm, patch(_PATCH_ENV) as mock_env:
            mock_env.WIKTIONARY.ENABLED = False
            result = await WortlautWordExtractorAgentWorkflow().run([])

        mock_llm.assert_not_called()
        assert result == []

    @pytest.mark.parametrize(
        "words",
        [["öffentlich"], ["öffentlich", "Interesse"], ["geeignet", "erforderlich", "angemessen"]],
    )
    async def test_all_extracted_words_appear_in_meanings_dict(self, words: list[str]) -> None:
        """Tests if all words extracted by the LLM appear as keys in the meanings_dict of the result."""
        processor = _make_processor("0", "öffentliches Interesse")
        with patch(_PATCH_LLM, new_callable=AsyncMock) as mock_llm, patch(_PATCH_ENV) as mock_env:
            mock_env.WIKTIONARY.ENABLED = False
            mock_llm.return_value = WordExtractorOutput(extracted_words=words)
            result = await WortlautWordExtractorAgentWorkflow().run([processor])

        for word in words:
            assert word in result[0].meanings_dict
