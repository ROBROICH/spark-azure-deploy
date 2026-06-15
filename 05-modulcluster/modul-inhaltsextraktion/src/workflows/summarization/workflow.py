"""Chunk-level summarization workflow."""

from pydantic import BaseModel
from temporalio import workflow

from src.activities.postprocessing.assembly import split_markdown_by_pages
from src.activities.summarization import (
    CombineSummariesInput,
    _combine_summaries,
    _summarize_chunks_batch,
)
from src.config import snapshot_config
from src.workflows.summarization.output_format import SummaryOutput


class SummarizationWorkflowInput(BaseModel):
    """Input for the chunk-level summarization workflow."""

    markdown: str

    # Summarization parameters
    pages_per_chunk: int = 8
    threshold: int = 10000
    combine_size: int = 4
    char_limit: int = 3000


summarization_workflow_id = "summarization-workflow"


@workflow.defn(name=summarization_workflow_id)
class SummarizationWorkflow:
    """Chunk-level summarization workflow."""

    @workflow.run
    async def run(self, input: SummarizationWorkflowInput) -> SummaryOutput:
        """Summarize a batch of document chunks."""
        cfg = snapshot_config()
        workflow.logger.info("Starting SUMMARIZATION workflow")

        chunks = await split_markdown_by_pages(input.markdown, input.pages_per_chunk)

        total_chunks = len(chunks)

        if total_chunks == 0:
            workflow.logger.info("No chunks to summarize. Skipping summarization.")
            return SummaryOutput(summary="")

        workflow.logger.info(f"Processing {total_chunks} chunks for summarization")

        summaries: list[str] = []
        batch_size = cfg.SUMMARIZATION_BATCH_SIZE
        total_batches = (total_chunks + batch_size - 1) // batch_size
        for i in range(0, total_chunks, batch_size):
            batch = chunks[i : i + batch_size]
            workflow.logger.info(f"📦 Summarizing batch {i}/{total_batches}: chunks {i}-{i + batch_size - 1}")

            batch_summaries = await _summarize_chunks_batch(batch)
            summaries.extend(batch_summaries)

        workflow.logger.info(f"Finished summarizing {total_chunks} chunks in {total_batches} batches")

        # 4. Iteratively reduce summaries if needed
        reduction_round = 0
        while sum(len(s) for s in summaries) > input.threshold and len(summaries) > 1:
            reduction_round += 1
            workflow.logger.info(
                f"Reduction round {reduction_round}: Total length ({sum(len(s) for s in summaries)}) "
                f"exceeds threshold. Combining {len(summaries)} summaries."
            )
            total_summaries = len(summaries)
            new_summaries: list[str] = []
            for i in range(0, total_summaries, input.combine_size):
                block = summaries[i : i + input.combine_size]

                combined = await _combine_summaries(
                    CombineSummariesInput(summaries=block, char_limit=999999),
                )
                new_summaries.append(combined)

            summaries = new_summaries
            workflow.logger.info(f"Reduction complete. New summary count: {len(summaries)}")

        # 5. Final combination and optional condensation
        final_summary = await _combine_summaries(
            CombineSummariesInput(summaries=summaries, char_limit=input.char_limit),
        )

        workflow.logger.info(f"✅ Summarization workflow (DMS) completed ({len(final_summary)} chars)")
        return SummaryOutput(summary=final_summary)
