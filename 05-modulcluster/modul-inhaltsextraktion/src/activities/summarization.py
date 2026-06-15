"""Chunk summarization and combination activities."""

import asyncio

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import llm_invoke_structured

from src.env import ENV
from src.workflows.summarization.output_format import SummaryOutput
from src.workflows.summarization.prompt import (
    FINAL_OVERVIEW_SYSTEM_PROMPT,
    FINAL_OVERVIEW_USER_TEMPLATE,
    INITIAL_SUMMARY_SYSTEM_PROMPT,
    INITIAL_SUMMARY_USER_TEMPLATE,
)


class CombineSummariesInput(BaseModel):
    """Input for the combine_summaries activity."""

    summaries: list[str]
    char_limit: int


async def _combine_summaries(input: CombineSummariesInput) -> str:
    """
    Combines multiple summaries into a final summary.

    If the combined text exceeds char_limit, it runs a final condensation LLM call.
    """
    summaries = input.summaries
    char_limit = input.char_limit
    complete_summary = "\n".join(summaries)

    # If already short enough, return as-is
    if len(complete_summary) <= char_limit:
        return complete_summary

    # Run final condensation
    result = await llm_invoke_structured(
        render_prompt_format(FINAL_OVERVIEW_USER_TEMPLATE, complete_summary=complete_summary),
        wrap_system_prompt(FINAL_OVERVIEW_SYSTEM_PROMPT),
        SummaryOutput,
        model=ENV.SUMMARIZATION_MODEL_NAME,
        temperature=0.1,
    )

    return result.summary


# --- DMS-specific Activities ---


async def _summarize_chunks_batch(
    chunks: list[str],
) -> list[str]:
    """Summarize a batch of chunks concurrently using LLM calls."""

    async def summarize_single(chunk_content: str) -> str:
        """Summarize a single chunk via LLM."""
        result = await llm_invoke_structured(
            render_prompt_format(INITIAL_SUMMARY_USER_TEMPLATE, content=chunk_content),
            wrap_system_prompt(INITIAL_SUMMARY_SYSTEM_PROMPT),
            SummaryOutput,
            model=ENV.SUMMARIZATION_MODEL_NAME,
            temperature=0.1,
        )
        return result.summary

    # Process all chunks in batch concurrently
    tasks = [summarize_single(chunk) for chunk in chunks]
    summaries = await asyncio.gather(*tasks)

    return list(summaries)
