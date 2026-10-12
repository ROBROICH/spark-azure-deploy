"""Agent for extracting individual words requiring Wortlaut-Auslegung."""

import asyncio

from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.activities.wiktionary import get_wiktionary_meaning
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we_data_format import (
    WordExtractorOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we_prompt import (
    word_extractor_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow_types import (
    WortlautProcessor,
)


@workflow.defn(name="WortlautWordExtractorAgentWorkflow")
class WortlautWordExtractorAgentWorkflow:
    """Workflow agent extracting words requiring Wortlaut-Auslegung."""

    @workflow.run
    async def run(self, u_rechtsbegriffe: list[WortlautProcessor]) -> list[WortlautProcessor]:
        """Extract words from unbestimmte Rechtsbegriffe that need interpretation."""
        extractor_coros = [
            llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.LARGE_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": word_extractor_prompt,
                    "input_dict": {
                        "unbestimmter_rechtsbegriff": entry.u_begriff,
                    },
                },
                output_class=WordExtractorOutput,
            )
            for entry in u_rechtsbegriffe
        ]
        extracted_word_list = await asyncio.gather(*extractor_coros)

        pairs = [
            (entry, word)
            for entry, res in zip(u_rechtsbegriffe, extracted_word_list, strict=True)
            for word in res.extracted_words
        ]

        if ENV.WIKTIONARY.ENABLED:
            async def _process(pair: tuple[WortlautProcessor, str]) -> None:
                """Invoke LLM to extract interpretable words from a single term."""
                entry, word = pair
                wiki_output = await get_wiktionary_meaning(word)
                entry.meanings_dict[word] = wiki_output.meanings
                # Only include source URL if meanings were found.
                if wiki_output.meanings:
                    entry.wiki_source_dict[word] = wiki_output.url

            await sliding_window(pairs, _process, concurrency=10)
        else:
            # API disabled: populate meanings_dict keys with empty lists, no sources.
            for entry, word in pairs:
                entry.meanings_dict[word] = []

        return u_rechtsbegriffe
