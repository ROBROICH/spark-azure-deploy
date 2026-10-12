# src/activities/hypothetical_questions.py
"""
Temporal activities for Hypothetical Questions extraction.

Architecture:
- process_hypothetical_questions_batch: Generates questions for a batch of chunks with
  batched LLM calls (see enrichment_utils.run_batched_enrichment).
"""

from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporalio import workflow

from src.activities.enrichment_utils import build_chunks_text, run_batched_enrichment, with_metadata
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

_MAX_QUESTIONS_PER_CHUNK = 3


async def _generate_questions(chunks: list[Chunk]) -> list[HypotheticalQuestionsResult]:
    result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_HQ_USER_TEMPLATE,
            chunks_text=build_chunks_text(chunks, heading="Textabschnitt", labelled=True),
        ),
        wrap_system_prompt(BATCHED_HQ_SYSTEM_PROMPT),
        BatchedHypotheticalQuestionsResponse,
        model=ENV.METADATA_MODEL_NAME,
        temperature=0.1,
    )
    results = result.results
    if len(results) == len(chunks) or workflow.patched("hypothetical-questions-single-chunk-fallback"):
        return results
    workflow.logger.warning(
        "Batched hypo questions returned %d results for %d chunks, padding with empty results",
        len(results),
        len(chunks),
    )
    padding = [HypotheticalQuestionsResult(questions=[]) for _ in range(len(chunks) - len(results))]
    return [*results, *padding][: len(chunks)]


def _apply_questions(chunk: Chunk, result: HypotheticalQuestionsResult) -> Chunk:
    questions: list[str] = result.questions[:_MAX_QUESTIONS_PER_CHUNK] if result.questions else []
    if not questions:
        return chunk
    return with_metadata(chunk, {"hypothetical_questions": questions})


@dataclass
class ProcessHypotheticalQuestionsBatchInput:
    """Input for Hypothetical Questions batch processing."""

    chunks: list[Chunk]


async def process_hypothetical_questions_batch(
    input: ProcessHypotheticalQuestionsBatchInput,
) -> list[Chunk]:
    """Workflow wrapper: splits chunks into sub-batches and runs each as a separate LLM call."""
    cfg = get_config()
    results = await run_batched_enrichment(
        input.chunks,
        batch_size=cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE,
        invoke=_generate_questions,
        empty_result=lambda: HypotheticalQuestionsResult(questions=[]),
        label="hypothetical questions",
    )
    return [_apply_questions(chunk, result) for chunk, result in zip(input.chunks, results, strict=True)]
