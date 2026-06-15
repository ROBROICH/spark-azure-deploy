"""Stage 2b: Detail-Planner — batched SVM assignment to a fixed chapter structure."""

from __future__ import annotations

import asyncio

from temporal.activities.llm import llm_invoke
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.config import config
from src.env import ENV
from src.models.types import (
    DetailPlannerEntry,
    DetailPlannerInput,
    DetailPlannerResult,
    MicroSummary,
)
from src.prompts.detail_planner import (
    DETAIL_PLANNER_SYSTEM_PROMPT,
    build_detail_planner_prompt,
)
from src.utils.json_parsing import parse_json_response


def _chunk_list(items: list[MicroSummary], size: int) -> list[list[MicroSummary]]:
    """Split a list into chunks of at most *size* items."""
    return [items[i : i + size] for i in range(0, len(items), size)]


async def _process_batch(
    input: DetailPlannerInput,
    batch: list[MicroSummary],
    num_chapters: int,
) -> tuple[dict[str, int], list[str]]:
    """Process a single batch: call LLM and parse assignments, with retry on validation failure."""
    max_attempts = config.DETAIL_PLANNER.VALIDATION_MAX_ATTEMPTS
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        prompt = build_detail_planner_prompt(
            plan=input.plan,
            micros_by_id=input.micros_by_id,
            batch=batch,
            norm=input.norm,
            satz_text=input.satz_text,
        )

        content = await llm_invoke(
            prompt=prompt,
            system_prompt=DETAIL_PLANNER_SYSTEM_PROMPT,
            model=ENV.LITELLM.MODEL,
            temperature=0.1,
            no_cache=True,
        )

        try:
            data = parse_json_response(content)
            if not isinstance(data, list):
                raise ValueError("Detail-Planner returned non-array response")

            entries = [DetailPlannerEntry.model_validate(e) for e in data]
        except Exception as e:
            last_error = e
            workflow.logger.warning(
                "Detail-Planner batch validation failed (attempt %d/%d): %s",
                attempt,
                max_attempts,
                e,
            )
            continue

        batch_svm_ids = {m.svm_id for m in batch}
        assignments: dict[str, int] = {}
        skipped: list[str] = []

        for entry in entries:
            if entry.svm_id not in batch_svm_ids:
                continue
            if entry.kapitel_index is None:
                skipped.append(entry.svm_id)
            elif 0 <= entry.kapitel_index < num_chapters:
                assignments[entry.svm_id] = entry.kapitel_index

        return assignments, skipped

    raise ApplicationError(
        f"Detail-Planner batch validation failed after {max_attempts} attempts: {last_error}",
        non_retryable=False,
    )

detail_planner_workflow_id = "DetailPlannerWorkflow"


@workflow.defn(name=detail_planner_workflow_id)
class DetailPlannerWorkflow:
    """Assign filtered SVMs to fixed chapters in parallel batches."""

    @workflow.run
    async def run(self, input: DetailPlannerInput) -> DetailPlannerResult:
        """Split filtered micros into batches, classify each in parallel."""
        batch_size = config.DETAIL_PLANNER.BATCH_SIZE
        batches = _chunk_list(input.filtered_micros, batch_size)
        num_chapters = len(input.plan.kapitel)

        tasks = [_process_batch(input, batch, num_chapters) for batch in batches]
        results = await asyncio.gather(*tasks)

        all_assignments: dict[str, int] = {}
        all_skipped: list[str] = []
        for assignments, skipped in results:
            all_assignments.update(assignments)
            all_skipped.extend(skipped)

        return DetailPlannerResult(
            assignments=all_assignments,
            skipped=all_skipped,
        )
