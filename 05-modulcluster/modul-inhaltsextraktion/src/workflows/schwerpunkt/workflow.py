# src/workflows/schwerpunkt/workflow.py
"""
Temporal workflow for Schwerpunktthema extraction.

Processes chunks in concurrent batches. LLM calls are dispatched to the
shared LLM worker via Temporal activities.
"""

import asyncio

from pydantic import BaseModel
from temporalio import workflow

from src.activities.schwerpunkt_extraction import (
    ProcessSchwerpunktBatchInput,
    process_schwerpunkt_batch,
)
from src.config import snapshot_config
from src.schemas import Chunk


class SchwerpunktWorkflowInput(BaseModel):
    """Input for the Schwerpunkt topic classification workflow."""

    chunks: list[Chunk]


class SchwerpunktWorkflowOutput(BaseModel):
    """Output of the Schwerpunkt topic classification workflow."""

    chunks: list[Chunk]
    added_metadata: bool


schwerpunkt_workflow_id = "schwerpunkt-workflow"


@workflow.defn(name=schwerpunkt_workflow_id)
class SchwerpunktWorkflow:
    """
    Workflow for extracting Schwerpunktthema metadata from document chunks.

    Processes chunks in concurrent batches. LLM calls are dispatched to the
    shared LLM worker via Temporal activities.
    """

    @workflow.run
    async def run(self, input: SchwerpunktWorkflowInput) -> SchwerpunktWorkflowOutput:
        """Classify document chunks by topic in batches."""
        cfg = snapshot_config()

        if not cfg.ENABLE_SCHWERPUNKTTHEMA_EXTRACTION:
            return SchwerpunktWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_size = cfg.SCHWERPUNKT_BATCH_SIZE
        batches = [input.chunks[i : i + batch_size] for i in range(0, len(input.chunks), batch_size)]
        num_batches = len(batches)

        workflow.logger.info(
            f"Processing {len(input.chunks)} chunks for Schwerpunktthema in {num_batches} batches of {batch_size}"
        )

        if num_batches == 0:
            return SchwerpunktWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_results = await asyncio.gather(
            *[
                process_schwerpunkt_batch(
                    ProcessSchwerpunktBatchInput(chunks=batch),
                    num_concurrent_batches=num_batches,
                )
                for batch in batches
            ]
        )

        updated_chunks: list[Chunk] = []
        for result in batch_results:
            updated_chunks.extend(result)

        workflow.logger.info(f"Schwerpunkt extraction completed for {len(updated_chunks)} chunks")
        return SchwerpunktWorkflowOutput(chunks=updated_chunks, added_metadata=True)
