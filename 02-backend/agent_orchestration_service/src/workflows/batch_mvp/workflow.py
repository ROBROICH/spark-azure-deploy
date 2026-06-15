from datetime import timedelta

from temporal.utils import WorkflowName, sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.batch_mvp.activity import _fetch_project_norms, _process_cached_norm_deconstructions
from src.workflows.batch_mvp.types import (
    BatchMVPWorkflowInput,
    BatchMVPWorkflowOutput,
    CachedNormDeconstructionBatchInput,
    CachedNormDeconstructionBatchOutput,
    NormRef,
)
from src.workflows.mvp.types import MVPWorkflowInput, MVPWorkflowOutput

MAX_CONCURRENT_MVP = 5

BATCH_MVP_WORKFLOW_ID = WorkflowName("BatchMVPWorkflow")


@workflow.defn(name=BATCH_MVP_WORKFLOW_ID)
class BatchMVPWorkflow:
    """Fan out MVPWorkflow for every norm in a project."""

    @workflow.run
    async def run(self, input: BatchMVPWorkflowInput) -> BatchMVPWorkflowOutput:
        job_id = workflow.info().workflow_id

        # Step 1+2: Fetch all norms for the project's topics
        norms: list[NormRef] = await workflow.execute_activity(
            _fetch_project_norms,
            input.project_id,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        workflow.logger.info("[BATCH MVP] %s — %d norms to process", job_id, len(norms))

        if not norms:
            return BatchMVPWorkflowOutput(project_id=input.project_id, results=[])

        # No retry policy is intentional: Temporal's default is unbounded retries.
        # Cache misses are far more expensive than waiting for the cache and graph
        # APIs to recover, and this activity re-reads graph state before retry writes.
        cached_batch = await workflow.execute_activity(
            _process_cached_norm_deconstructions,
            CachedNormDeconstructionBatchInput(project_id=input.project_id, norms=norms),
            start_to_close_timeout=timedelta(minutes=30),
        )
        cached_batch = CachedNormDeconstructionBatchOutput.model_validate(cached_batch)

        workflow.logger.info(
            "[BATCH MVP] %s — %d cached norms inserted, %d cache misses",
            job_id,
            len(cached_batch.results),
            len(cached_batch.uncached_norms),
        )

        results = list(cached_batch.results)

        if not cached_batch.uncached_norms:
            return BatchMVPWorkflowOutput(project_id=input.project_id, results=results)

        # Step 3: Fan out MVPWorkflow for cache misses
        indexed_norms = list(enumerate(cached_batch.uncached_norms))

        async def _run_mvp(item: tuple[int, NormRef]) -> MVPWorkflowOutput | None:
            idx, norm = item
            child_input = MVPWorkflowInput(
                project_id=input.project_id,
                jurabk=norm.jurabk,
                paragraph_nr=norm.paragraph_nr,
            )
            try:
                raw = await workflow.execute_child_workflow(
                    "MVPWorkflow",
                    child_input,
                    id=f"{job_id}-mvp-{idx}",
                    execution_timeout=timedelta(hours=12),
                    task_timeout=timedelta(seconds=60),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                return MVPWorkflowOutput.model_validate(raw)
            except Exception:
                workflow.logger.error(
                    "[BATCH MVP] %s — mvp-%d failed for %s §%s",
                    job_id,
                    idx,
                    norm.jurabk,
                    norm.paragraph_nr,
                )
                return None

        raw_results = await sliding_window(indexed_norms, _run_mvp, MAX_CONCURRENT_MVP)
        uncached_results = [r for r in raw_results if r is not None]
        failed = len(raw_results) - len(uncached_results)
        results.extend(uncached_results)

        workflow.logger.info(
            "[BATCH MVP DONE] %s — %d norms processed, %d skipped, %d failed",
            job_id,
            len(results),
            sum(1 for r in results if r.skipped),
            failed,
        )

        return BatchMVPWorkflowOutput(
            project_id=input.project_id,
            results=results,
        )
