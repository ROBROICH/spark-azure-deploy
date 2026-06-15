"""MVPWorkflow -- end-to-end pipeline: Rechtsmethodik -> insert.

For a single norm (jurabk + paragraph_nr), runs Rechtsmethodik analysis
and persists results into the examination service graph.
"""

from datetime import timedelta
from typing import Any

from pydantic import ValidationError
from temporal.workflows.rechtsmethodik.rechtsmethodik_workflow import (
    RECHTSMETHODIK_WORKFLOW_ID,
)
from temporal.workflows.rechtsmethodik.types import (
    RechtsmethodikWorkflowInput,
    RechtsmethodikWorkflowOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.insert_rechtsmethodik_results.types import (
    InsertRechtsmethodikResultOutput,
    InsertRechtsmethodikResultsInput,
)
from src.workflows.insert_rechtsmethodik_results.workflow import (
    InsertRechtsmethodikResultsWorkflow,
)
from src.workflows.mvp.activity import (
    _get_norm_deconstruction,
    _save_norm_deconstruction,
)
from src.workflows.mvp.types import MVPWorkflowInput, MVPWorkflowOutput

RECHTSMETHODIK_TASK_QUEUE = "rechtsmethodik"


async def _run_rechtsmethodik_and_insert(
    input: MVPWorkflowInput,
) -> tuple[RechtsmethodikWorkflowOutput, list[InsertRechtsmethodikResultOutput]]:
    """Steps 2+3: Get or compute Rechtsmethodik result, then insert it."""

    # No retry policy is intentional: Temporal's default is unbounded retries.
    # A cache miss costs roughly 20 minutes of Rechtsmethodik work per norm,
    # so waiting for the cache endpoint to recover is faster than fallback.
    precomputed: dict[str, Any] | None = await workflow.execute_activity(
        _get_norm_deconstruction,
        {"jurabk": input.jurabk, "paragraph_nr": input.paragraph_nr},
        start_to_close_timeout=timedelta(seconds=30),
    )

    rm_output: RechtsmethodikWorkflowOutput | None = None
    if precomputed:
        try:
            rm_output = RechtsmethodikWorkflowOutput(**precomputed)
        except ValidationError:
            rm_output = None

    # ── Fall back to running Rechtsmethodik workflow ────────────────
    if rm_output is None:
        rm_workflow_id = f"{workflow.info().workflow_id}-rechtsmethodik"

        rm_raw = await workflow.execute_child_workflow(
            RECHTSMETHODIK_WORKFLOW_ID,
            RechtsmethodikWorkflowInput(
                jurabk=input.jurabk,
                paragraph_nr=input.paragraph_nr,
            ),
            id=rm_workflow_id,
            task_queue=RECHTSMETHODIK_TASK_QUEUE,
            execution_timeout=timedelta(hours=6),
            task_timeout=timedelta(seconds=60),
        )
        rm_output = RechtsmethodikWorkflowOutput(**rm_raw)

        # Save fresh result to norm_deconstruction table for future lookups
        await workflow.execute_activity(
            _save_norm_deconstruction,
            {"jurabk": input.jurabk, "paragraph_nr": input.paragraph_nr, "deconstruction": rm_output.model_dump()},
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=20),
        )

    # ── Step 3: Insert Rechtsmethodik results ───────────────────────
    rm_insert_results = await workflow.execute_child_workflow(
        InsertRechtsmethodikResultsWorkflow.run,
        InsertRechtsmethodikResultsInput(
            project_id=input.project_id,
            norm_results=[rm_output],
        ),
        id=f"{workflow.info().workflow_id}-insert-rm",
    )

    return rm_output, rm_insert_results


@workflow.defn(name="MVPWorkflow")
class MVPWorkflow:
    """End-to-end pipeline for a single norm: Rechtsmethodik -> insert."""

    @workflow.run
    async def run(self, input: MVPWorkflowInput) -> MVPWorkflowOutput:
        # ── Steps 1+2: Rechtsmethodik + insert ─────────────────────────
        _rm_output, rm_insert_results = await _run_rechtsmethodik_and_insert(input)
        rm_insert = rm_insert_results[0]

        if not rm_insert.norm_id:
            return MVPWorkflowOutput(
                project_id=input.project_id,
                jurabk=input.jurabk,
                paragraph_nr=input.paragraph_nr,
                skipped=True,
                gesetz_id=rm_insert.gesetz_id,
            )

        return MVPWorkflowOutput(
            project_id=input.project_id,
            jurabk=input.jurabk,
            paragraph_nr=input.paragraph_nr,
            skipped=rm_insert.skipped,
            gesetz_id=rm_insert.gesetz_id,
            norm_id=rm_insert.norm_id,
        )
