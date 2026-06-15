# src/activities/species_scale_extraction.py
"""
Temporal activities for Species/Scale extraction.

Architecture:
- _process_species_scale_batch: Processes a batch of chunks using batched LLM calls.
  Errors propagate for Temporal retry.
"""

import asyncio
import re
from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporalio import workflow

from src.config import get_config
from src.env import ENV
from src.schemas import Chunk
from src.workflows.species_scale.output_format import (
    BatchedSpeciesAndScaleResponse,
    SpeciesAndScaleResult,
)
from src.workflows.species_scale.prompt import (
    BATCHED_SPECIES_SCALE_SYSTEM_PROMPT,
    BATCHED_SPECIES_SCALE_USER_TEMPLATE,
)

# Module-level constants to avoid repetition


def _clean_content_for_species_scale(content: str) -> str:
    """
    Cleans markdown content for species/scale extraction by replacing
    BILD and TABELLE blocks with only their summary tags.
    """
    from src.activities.enrichment_utils import extract_table_text

    def replace_bild(match: re.Match[str]) -> str:
        bild_content = match.group(1)
        summary_match = re.search(r"<summary>(.*?)</summary>", bild_content, re.DOTALL)
        return summary_match.group(1) if summary_match else ""

    def replace_tabelle(match: re.Match[str]) -> str:
        tabelle_content = match.group(1)
        summary_match = re.search(r"<summary>(.*?)</summary>", tabelle_content, re.DOTALL)
        if summary_match and summary_match.group(1).strip():
            return summary_match.group(1)
        return extract_table_text(tabelle_content)

    content = re.sub(r"<BILD[^>]*>(.*?)</BILD>", replace_bild, content, flags=re.DOTALL)
    content = re.sub(r"<TABELLE[^>]*>(.*?)</TABELLE>", replace_tabelle, content, flags=re.DOTALL)
    return content


async def _extract_single_species_scale(chunk: Chunk) -> SpeciesAndScaleResult:
    """Extract species and scale from a single chunk (fallback for batch mismatch)."""
    single_result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_SPECIES_SCALE_USER_TEMPLATE,
            chunks_text=f"--- Textabschnitt 1 ---\n{_clean_content_for_species_scale(chunk.page_content)}",
        ),
        wrap_system_prompt(BATCHED_SPECIES_SCALE_SYSTEM_PROMPT),
        BatchedSpeciesAndScaleResponse,
        model=ENV.METADATA_MODEL_NAME,
        temperature=0.1,
    )
    return single_result.extractions[0] if single_result.extractions else SpeciesAndScaleResult()


async def _extract_species_scale_batch(
    chunks: list[Chunk],
) -> list[SpeciesAndScaleResult]:
    """Extract species and scale from multiple chunks in a single LLM call.

    Errors propagate to let Temporal retry the activity.
    """
    snippet_parts = []
    for i, chunk in enumerate(chunks):
        cleaned_content = _clean_content_for_species_scale(chunk.page_content)
        snippet_parts.append(f"--- Textabschnitt {i + 1} ---\n{cleaned_content}")
    chunks_text = "\n\n".join(snippet_parts)

    result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_SPECIES_SCALE_USER_TEMPLATE,
            chunks_text=chunks_text,
        ),
        wrap_system_prompt(BATCHED_SPECIES_SCALE_SYSTEM_PROMPT),
        BatchedSpeciesAndScaleResponse,
        model=ENV.METADATA_MODEL_NAME,
        temperature=0.1,
    )

    if len(result.extractions) == len(chunks):
        return result.extractions

    # Count mismatch — fall back to individual processing
    workflow.logger.warning(
        "Batched species/scale returned %d results for %d chunks, falling back to individual processing",
        len(result.extractions),
        len(chunks),
    )
    individual_results: list[SpeciesAndScaleResult] = []
    for chunk in chunks:
        individual_results.append(await _extract_single_species_scale(chunk))
    return individual_results


@dataclass
class ProcessSpeciesScaleBatchInput:
    """Input for Species/Scale batch processing."""

    chunks: list[Chunk]


async def _process_species_scale_batch(
    input: ProcessSpeciesScaleBatchInput,
) -> list[Chunk]:
    """Processes a batch of chunks for Species/Scale extraction using batched LLM calls."""
    chunks = input.chunks
    cfg = get_config()
    batch_size = cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE

    sub_batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    species_scale_tasks = [_extract_species_scale_batch(batch) for batch in sub_batches]

    all_results = await asyncio.gather(*species_scale_tasks)

    species_scale_results: list[SpeciesAndScaleResult] = []
    for result in all_results:
        species_scale_results.extend(result)

    enriched_chunks = []
    for j, chunk in enumerate(chunks):
        result = species_scale_results[j]
        result_dict = result.model_dump()

        updated_metadata = {**chunk.metadata, **result_dict}
        updated_sub_chunks = [
            sub_chunk.model_copy(update={"metadata": {**sub_chunk.metadata, **result_dict}})
            for sub_chunk in chunk.sub_chunks
        ]

        enriched_chunks.append(
            chunk.model_copy(update={"metadata": updated_metadata, "sub_chunks": updated_sub_chunks})
        )

    return enriched_chunks


async def process_species_scale_batch(
    input: ProcessSpeciesScaleBatchInput,
    num_concurrent_batches: int = 1,
) -> list[Chunk]:
    """Workflow wrapper for Species/Scale batch processing."""
    return await _process_species_scale_batch(input)
