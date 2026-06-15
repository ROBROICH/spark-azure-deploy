# src/workflows/hypothetical_questions/workflow.py
"""
Temporal workflow for Hypothetical Questions extraction.

Processes chunks in concurrent batches. LLM calls are dispatched to the
shared LLM worker via Temporal activities.
"""

import asyncio
from dataclasses import dataclass

from temporalio import workflow

from src.activities.hypothetical_questions import (
    ProcessHypotheticalQuestionsBatchInput,
    process_hypothetical_questions_batch,
)
from src.config import snapshot_config
from src.schemas import Chunk


@dataclass
class HypotheticalQuestionsWorkflowInput:
    """Input for the Hypothetical Questions extraction workflow."""

    chunks: list[Chunk]


@dataclass
class HypotheticalQuestionsWorkflowOutput:
    """Output from the Hypothetical Questions extraction workflow."""

    chunks: list[Chunk]
    added_metadata: bool


hypothetical_questions_workflow_id = "hypothetical-questions-workflow"


@workflow.defn(name=hypothetical_questions_workflow_id)
class HypotheticalQuestionsWorkflow:
    """
    Workflow for generating Hypothetical Questions from document chunks.

    Processes chunks in concurrent batches. LLM calls are dispatched to the
    shared LLM worker via Temporal activities.
    """

    @workflow.run
    async def run(self, input: HypotheticalQuestionsWorkflowInput) -> HypotheticalQuestionsWorkflowOutput:
        """Generate hypothetical questions for document chunks in batches."""
        cfg = snapshot_config()

        if not cfg.ENABLE_HYPOTHETICAL_QUESTIONS:
            return HypotheticalQuestionsWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_size = cfg.HYPOTHETICAL_QUESTIONS_BATCH_SIZE
        batches = [input.chunks[i : i + batch_size] for i in range(0, len(input.chunks), batch_size)]
        num_batches = len(batches)

        workflow.logger.info(
            f"Processing {len(input.chunks)} chunks for Hypothetical Questions in {num_batches} batches of {batch_size}"
        )

        if num_batches == 0:
            return HypotheticalQuestionsWorkflowOutput(chunks=input.chunks, added_metadata=False)

        batch_results = await asyncio.gather(
            *[
                process_hypothetical_questions_batch(
                    ProcessHypotheticalQuestionsBatchInput(chunks=batch),
                )
                for batch in batches
            ]
        )

        updated_chunks: list[Chunk] = []
        for result in batch_results:
            updated_chunks.extend(result)

        workflow.logger.info(f"Hypothetical Questions extraction completed for {len(updated_chunks)} chunks")
        return HypotheticalQuestionsWorkflowOutput(chunks=updated_chunks, added_metadata=True)
