"""Parent workflow: BewertungOrchestratorWorkflow.

Gather → [SuZ if no Fundstellen] → Process → Insert.
"""

from datetime import timedelta

from temporal import get_temporal_client
from temporal.project_context import project_scoped_workflow_id
from temporal.utils import await_with_heartbeat
from temporalio import activity, workflow
from temporalio.client import WorkflowFailureError
from temporalio.common import Priority, WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import ApplicationError, WorkflowAlreadyStartedError

from src.config.settings import settings
from src.workflows.bewertung.gather import gather_norm_context
from src.workflows.bewertung.insert import InsertBewertungResultsWorkflow
from src.workflows.bewertung.process import ProcessBewertungenWorkflow
from src.workflows.bewertung.types import (
    BEWERTUNG_WORKFLOW_ID,
    BewertungInput,
    BewertungOutput,
    InsertBewertungInput,
    InsertBewertungOutput,
    NormContext,
    ProcessBewertungenInput,
    ProcessBewertungenOutput,
)
from src.workflows.suche_zuordnung_norm.types import (
    SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID,
    SucheZuordnungNormWorkflowInput,
)


@activity.defn
async def start_and_await_suz(
    input: SucheZuordnungNormWorkflowInput,
) -> None:
    """Start or attach to an existing SuZ workflow and await its result.

    Uses id_conflict_policy=USE_EXISTING so that:
    - If no SuZ is running → starts a new one and awaits result.
    - If SuZ is already running (e.g. via its own endpoint) → attaches and awaits.
    - If SuZ already completed successfully → skips (results already exist).
    - If SuZ previously failed → starts a fresh run.
    """
    client = await get_temporal_client()
    workflow_id = project_scoped_workflow_id(
        str(SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID),
        input.project_id,
        None,
        input.norm_id,
    )

    try:
        handle = await client.start_workflow(
            SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID,
            input,
            id=workflow_id,
            task_queue=settings.temporal.task_queue,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
            id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
            priority=Priority(fairness_key="priority", fairness_weight=2.0),
        )
    except WorkflowAlreadyStartedError:
        # SuZ already completed successfully — results should exist, nothing to do
        activity.logger.info("SuZ %s already completed, skipping", workflow_id)
        return

    try:
        await await_with_heartbeat(handle.result(), detail=f"waiting for {workflow_id}")
    except WorkflowFailureError as err:
        raise ApplicationError(
            f"SuZ workflow {workflow_id} failed: {err}",
            non_retryable=True,
        ) from err


def _has_fundstellen(norm_context: NormContext) -> bool:
    return any(satz.fundstellen for satz in norm_context.saetze)


@workflow.defn(name=BEWERTUNG_WORKFLOW_ID)
class BewertungOrchestratorWorkflow:
    """Parent workflow: Gather → [SuZ if no Fundstellen] → Process → Insert."""

    @workflow.run
    async def run(self, input: BewertungInput) -> BewertungOutput:
        job_id = workflow.info().workflow_id

        # ── Step 1: Gather norm context (activity) ─────────────────
        norm_context = await gather_norm_context(input.project_id, input.norm_id)

        if not norm_context.saetze:
            workflow.logger.warning("[ORCHESTRATOR] %s — No Sätze found, skipping", job_id)
            return BewertungOutput(
                project_id=input.project_id,
                norm_id=input.norm_id,
                satz_results=[],
            )

        # ── Step 1b: Run SuZ if no Fundstellen exist yet ──────────
        if not _has_fundstellen(norm_context):
            await workflow.execute_activity(
                start_and_await_suz,
                SucheZuordnungNormWorkflowInput(
                    project_id=str(input.project_id),
                    norm_id=str(input.norm_id),
                ),
                start_to_close_timeout=timedelta(hours=12),
                heartbeat_timeout=timedelta(seconds=120),
            )

            # Re-gather to pick up the freshly inserted Fundstellen
            norm_context = await gather_norm_context(input.project_id, input.norm_id)

            if not _has_fundstellen(norm_context):
                return BewertungOutput(
                    project_id=input.project_id,
                    norm_id=input.norm_id,
                    satz_results=[],
                )

        # ── Step 2: Process — fan-out to modul-bewertung (child) ───
        process_output: ProcessBewertungenOutput = await workflow.execute_child_workflow(
            ProcessBewertungenWorkflow.run,
            ProcessBewertungenInput(norm_context=norm_context),
            id=f"{job_id}-process",
        )

        if not process_output.satz_outputs:
            return BewertungOutput(
                project_id=input.project_id,
                norm_id=input.norm_id,
                satz_results=[],
            )

        # ── Step 3: Insert results into examination service (child) ─
        insert_output: InsertBewertungOutput = await workflow.execute_child_workflow(
            InsertBewertungResultsWorkflow.run,
            InsertBewertungInput(
                project_id=input.project_id,
                satz_outputs=process_output.satz_outputs,
            ),
            id=f"{job_id}-insert",
        )

        return BewertungOutput(
            project_id=input.project_id,
            norm_id=input.norm_id,
            satz_results=insert_output.satz_results,
        )
