# src/activities/species_scale_extraction.py
"""
Temporal activities for Species/Scale extraction.

Architecture:
- process_species_scale_batch: Processes a batch of chunks with batched LLM calls
  (see enrichment_utils.run_batched_enrichment). Errors propagate for Temporal retry.
"""

from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured

from src.activities.enrichment_utils import build_chunks_text, run_batched_enrichment, with_metadata
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


async def _extract_species_scale(chunks: list[Chunk]) -> list[SpeciesAndScaleResult]:
    result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_SPECIES_SCALE_USER_TEMPLATE,
            chunks_text=build_chunks_text(chunks, heading="Textabschnitt", include_section=False),
        ),
        wrap_system_prompt(BATCHED_SPECIES_SCALE_SYSTEM_PROMPT),
        BatchedSpeciesAndScaleResponse,
        model=ENV.METADATA_MODEL_NAME,
        temperature=0.1,
    )
    return result.extractions


@dataclass
class ProcessSpeciesScaleBatchInput:
    """Input for Species/Scale batch processing."""

    chunks: list[Chunk]


async def process_species_scale_batch(
    input: ProcessSpeciesScaleBatchInput,
) -> list[Chunk]:
    """Processes a batch of chunks for Species/Scale extraction using batched LLM calls."""
    cfg = get_config()
    results = await run_batched_enrichment(
        input.chunks,
        batch_size=cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE,
        invoke=_extract_species_scale,
        empty_result=SpeciesAndScaleResult,
        label="species/scale",
    )
    return [with_metadata(chunk, result.model_dump()) for chunk, result in zip(input.chunks, results, strict=True)]
