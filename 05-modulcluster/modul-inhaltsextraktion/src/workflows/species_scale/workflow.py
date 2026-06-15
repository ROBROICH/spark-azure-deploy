# src/workflows/species_scale/workflow.py
"""
Temporal workflow for Species/Scale extraction.

Processes chunks in concurrent batches. LLM calls are dispatched to the
shared LLM worker via Temporal activities.
"""

import asyncio
from dataclasses import dataclass

from temporalio import workflow

from src.activities.species_scale_extraction import (
    ProcessSpeciesScaleBatchInput,
    process_species_scale_batch,
)
from src.config import snapshot_config
from src.schemas import Chunk


@dataclass
class SpeciesScaleWorkflowInput:
    """Input for the Species/Scale extraction workflow."""

    chunks: list[Chunk]


@dataclass
class SpeciesScaleWorkflowOutput:
    """Output from the Species/Scale extraction workflow."""

    chunks: list[Chunk]
    added_metadata: bool


species_scale_workflow_id = "species-scale-workflow"


@workflow.defn(name=species_scale_workflow_id)
class SpeciesScaleWorkflow:
    """
    Workflow for extracting Species/Scale metadata from document chunks.

    Processes chunks in concurrent batches. LLM calls are dispatched to the
    shared LLM worker via Temporal activities.
    """

    @workflow.run
    async def run(self, input: SpeciesScaleWorkflowInput) -> SpeciesScaleWorkflowOutput:
        """Extract species and map scale information from chunks in batches."""
        cfg = snapshot_config()

        if not cfg.ENABLE_SPECIES_SCALE_EXTRACTION:
            return SpeciesScaleWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_size = cfg.SPECIES_SCALE_BATCH_SIZE
        batches = [input.chunks[i : i + batch_size] for i in range(0, len(input.chunks), batch_size)]
        num_batches = len(batches)

        workflow.logger.info(
            f"Processing {len(input.chunks)} chunks for Species/Scale in {num_batches} batches of {batch_size}"
        )

        if num_batches == 0:
            return SpeciesScaleWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_results = await asyncio.gather(
            *[
                process_species_scale_batch(
                    ProcessSpeciesScaleBatchInput(chunks=batch),
                    num_concurrent_batches=num_batches,
                )
                for batch in batches
            ]
        )

        updated_chunks: list[Chunk] = []
        for result in batch_results:
            updated_chunks.extend(result)

        workflow.logger.info(f"Species/Scale extraction completed for {len(updated_chunks)} chunks")
        return SpeciesScaleWorkflowOutput(chunks=updated_chunks, added_metadata=True)
