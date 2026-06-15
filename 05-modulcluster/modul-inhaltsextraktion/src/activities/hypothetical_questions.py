# src/activities/hypothetical_questions.py
"""
Temporal activities for Hypothetical Questions extraction.

Architecture:
- _process_hypo_questions_batch: Processes a single sub-batch of chunks with one LLM call.
  Sub-batch splitting is done at the workflow level so each LLM call is independently
  retried by Temporal.
"""

import asyncio
import re
from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporalio import workflow

from src.activities.enrichment_utils import extract_table_text as _extract_table_text
from src.config import get_config
from src.env import ENV
from src.schemas import Chunk
from src.workflows.hypothetical_questions.output_format import (
    BatchedHypotheticalQuestionsResponse,
    HypotheticalQuestionsResult,
)
from src.workflows.hypothetical_questions.prompt import (
    BATCHED_HQ_SYSTEM_PROMPT,
    BATCHED_HQ_USER_TEMPLATE,
)


def _clean_content_for_hypothetical_questions(content: str) -> str:
    """
    Cleans markdown content for the hypothetical questions generator.

    Priority for BILD/TABELLE content:
    1. Use summary if available (most informative)
    2. Fall back to caption if no summary
    3. For tables: extract text from raw HTML if no summary/caption
    4. For images: use description if no summary
    """

    def replace_bild(match: re.Match[str]) -> str:
        bild_content = match.group(1)
        # Try summary first
        summary_match = re.search(r"<summary>(.*?)</summary>", bild_content, re.DOTALL)
        if summary_match and summary_match.group(1).strip():
            return f"[Bild: {summary_match.group(1).strip()}]"

        # Fall back to description
        desc_match = re.search(r"<description>(.*?)</description>", bild_content, re.DOTALL)
        if desc_match and desc_match.group(1).strip():
            return f"[Bild: {desc_match.group(1).strip()}]"

        # Fall back to caption
        caption_match = re.search(r"<caption_text>(.*?)</caption_text>", bild_content, re.DOTALL)
        if caption_match and caption_match.group(1).strip():
            return f"[Bild: {caption_match.group(1).strip()}]"

        return "[Bild]"

    def replace_tabelle(match: re.Match[str]) -> str:
        tabelle_content = match.group(1)
        # Try summary first
        summary_match = re.search(r"<summary>(.*?)</summary>", tabelle_content, re.DOTALL)
        if summary_match and summary_match.group(1).strip():
            return f"[Tabelle: {summary_match.group(1).strip()}]"

        # Fall back to caption
        caption_match = re.search(r"<caption_text>(.*?)</caption_text>", tabelle_content, re.DOTALL)
        if caption_match and caption_match.group(1).strip():
            caption = caption_match.group(1).strip()
            # Also try to extract some table content
            table_text = _extract_table_text(tabelle_content)
            if table_text:
                return f"[Tabelle '{caption}': {table_text}]"
            return f"[Tabelle: {caption}]"

        # Fall back to extracting text from raw HTML table
        table_text = _extract_table_text(tabelle_content)
        if table_text:
            return f"[Tabelle: {table_text}]"

        return "[Tabelle]"

    # Match BILD tags with or without attributes
    content = re.sub(r"<BILD[^>]*>(.*?)</BILD>", replace_bild, content, flags=re.DOTALL)
    # Match TABELLE tags with or without attributes
    content = re.sub(r"<TABELLE[^>]*>(.*?)</TABELLE>", replace_tabelle, content, flags=re.DOTALL)
    return content


@dataclass
class ProcessHypotheticalQuestionsBatchInput:
    """Input for Hypothetical Questions batch processing."""

    chunks: list[Chunk]


async def _process_hypo_questions_batch(
    input: ProcessHypotheticalQuestionsBatchInput,
) -> list[Chunk]:
    """
    Processes a sub-batch of chunks with a single LLM call.

    Returns:
        List of enriched Chunk objects with hypothetical_questions metadata
    """
    chunks = input.chunks

    # --- Single LLM call for this sub-batch ---
    snippet_parts = []
    for i, chunk in enumerate(chunks):
        cleaned_content = _clean_content_for_hypothetical_questions(chunk.page_content)
        aktueller_abschnitt = chunk.metadata.get("toc_path", "Nicht verfügbar")
        snippet_parts.append(
            f"--- Textabschnitt {i + 1} ---\n"
            f"**Aktueller Abschnitt:** {aktueller_abschnitt}\n\n"
            f'**Text:** "{cleaned_content}"'
        )
    chunks_text = "\n\n".join(snippet_parts)

    result = await llm_invoke_structured(
        render_prompt_format(BATCHED_HQ_USER_TEMPLATE, chunks_text=chunks_text),
        wrap_system_prompt(BATCHED_HQ_SYSTEM_PROMPT),
        BatchedHypotheticalQuestionsResponse,
        model=ENV.METADATA_MODEL_NAME,
        temperature=0.1,
    )

    # --- Map results back to chunks ---
    hypo_results: list[HypotheticalQuestionsResult]
    if len(result.results) == len(chunks):
        hypo_results = result.results
    else:
        workflow.logger.warning(
            "Batched hypo questions returned %d results for %d chunks, padding with empty results",
            len(result.results),
            len(chunks),
        )
        hypo_results = list(result.results)
        while len(hypo_results) < len(chunks):
            hypo_results.append(HypotheticalQuestionsResult(questions=[]))

    enriched_chunks: list[Chunk] = []
    for j, chunk in enumerate(chunks):
        questions: list[str] = hypo_results[j].questions[:3] if hypo_results[j].questions else []

        if questions:
            updated_metadata = {**chunk.metadata, "hypothetical_questions": questions}
            updated_sub_chunks = [
                sub_chunk.model_copy(
                    update={
                        "metadata": {
                            **sub_chunk.metadata,
                            "hypothetical_questions": questions,
                        }
                    }
                )
                for sub_chunk in chunk.sub_chunks
            ]
            enriched_chunks.append(
                chunk.model_copy(
                    update={
                        "metadata": updated_metadata,
                        "sub_chunks": updated_sub_chunks,
                    }
                )
            )
        else:
            enriched_chunks.append(chunk)

    return enriched_chunks


async def process_hypothetical_questions_batch(
    input: ProcessHypotheticalQuestionsBatchInput,
) -> list[Chunk]:
    """Workflow wrapper: splits chunks into sub-batches and runs each as a separate LLM call."""
    cfg = get_config()
    chunks = input.chunks
    batch_size = cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE

    sub_batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    sub_batch_results = await asyncio.gather(
        *[
            _process_hypo_questions_batch(
                ProcessHypotheticalQuestionsBatchInput(chunks=sub_batch),
            )
            for sub_batch in sub_batches
        ]
    )

    result: list[Chunk] = []
    for sub_result in sub_batch_results:
        result.extend(sub_result)
    return result
