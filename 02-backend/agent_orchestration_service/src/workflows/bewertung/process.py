"""Child 1: ProcessBewertungenWorkflow — fan-out bewertungs_workflow per Satz."""

from datetime import timedelta

from temporal.utils import sliding_window
from temporal.workflows.bewertung.bewertung import bewertungs_workflow_id
from temporal.workflows.bewertung.types import (
    BewertungsWorkflowInput,
    BewertungsWorkflowOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.bewertung.input_builder import build_satz_inputs
from src.workflows.bewertung.types import (
    ProcessBewertungenInput,
    ProcessBewertungenOutput,
    SatzBewertungResult,
)

BEWERTUNG_TASK_QUEUE = "bewertung"
MAX_CONCURRENT_BEWERTUNG = 50


@workflow.defn(name="ProcessBewertungenWorkflow")
class ProcessBewertungenWorkflow:
    """Child 1: Fan-out bewertungs_workflow per Satz via modul-bewertung."""

    @workflow.run
    async def run(self, input: ProcessBewertungenInput) -> ProcessBewertungenOutput:
        job_id = workflow.info().workflow_id

        # 1. Build BewertungsWorkflowInput per Satz (pure function)
        satz_inputs = build_satz_inputs(input.norm_context)

        skipped_satz_ids = [
            s.satz_id
            for s in input.norm_context.saetze
            if not s.fundstellen or s.norm_typ_lvl_1 != "materiell-rechtlich" or s.norm_typ_lvl_2 != "wenn-dann"
        ]
        if skipped_satz_ids:
            workflow.logger.info(
                "[PROCESS] %s — %d/%d Sätze übersprungen (keine Fundstellen oder kein materiell-rechtlich/wenn-dann)",
                job_id,
                len(skipped_satz_ids),
                len(input.norm_context.saetze),
            )

        if not satz_inputs:
            return ProcessBewertungenOutput(satz_outputs=[], skipped_satz_ids=skipped_satz_ids)

        # 2. Fan-out: one modul-bewertung child workflow per Satz
        indexed = list(enumerate(satz_inputs))

        async def _run_one(item: tuple[int, BewertungsWorkflowInput]) -> SatzBewertungResult:
            idx, bewertungs_input = item
            raw = await workflow.execute_child_workflow(
                bewertungs_workflow_id,
                bewertungs_input,
                id=f"{job_id}-satz-{idx}",
                task_queue=BEWERTUNG_TASK_QUEUE,
                task_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_interval=timedelta(minutes=5)),
            )
            return SatzBewertungResult(
                satz_id=bewertungs_input.satz_id,
                bewertung_output=BewertungsWorkflowOutput.model_validate(raw),
            )

        results = await sliding_window(indexed, _run_one, MAX_CONCURRENT_BEWERTUNG)
        return ProcessBewertungenOutput(satz_outputs=results, skipped_satz_ids=skipped_satz_ids)
