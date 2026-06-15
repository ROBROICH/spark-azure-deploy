from datetime import timedelta

from temporal.utils import sliding_window
from temporal.workflows.modul_suche_und_zuordnung.types import (
    SatzOrchestratorWorkflowOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.insert_suche_zuordnung_results.activity import (
    ResolveChunkDokumenteInput,
    WriteSatzFundstellenInput,
    _fetch_existing_dokumente_for_suz,
    _resolve_chunk_dokumente,
    _write_satz_fundstellen,
)
from src.workflows.insert_suche_zuordnung_results.mapper import map_fundstellen
from src.workflows.insert_suche_zuordnung_results.types import (
    SUCHE_ZUORDNUNG_INSERT_WORKFLOW_ID,
    TASK_QUEUE,
    InsertSucheZuordnungResultsInput,
    InsertSucheZuordnungResultsOutput,
)

api_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=10),
)


@workflow.defn(name=SUCHE_ZUORDNUNG_INSERT_WORKFLOW_ID)
class InsertSucheZuordnungResultsWorkflow:
    @workflow.run
    async def run(self, args: InsertSucheZuordnungResultsInput) -> InsertSucheZuordnungResultsOutput:
        dms_to_dokument: dict[str, str] = await workflow.execute_activity(
            _fetch_existing_dokumente_for_suz,
            args.project_id,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=api_retry_policy,
        )

        satz_results_to_process = [
            satz_result for satz_result in args.satz_orchestrator_outputs if satz_result.originaltexte
        ]

        if not satz_results_to_process:
            return InsertSucheZuordnungResultsOutput(skipped=True)

        async def process_one(
            satz_output: SatzOrchestratorWorkflowOutput,
        ) -> InsertSucheZuordnungResultsOutput:
            all_chunk_ids = sorted({cid for entry in satz_output.originaltexte for cid in entry.chunk_ids if cid})
            chunk_to_dokument = await workflow.execute_activity(
                _resolve_chunk_dokumente,
                ResolveChunkDokumenteInput(
                    project_id=args.project_id,
                    chunk_ids=all_chunk_ids,
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=api_retry_policy,
            )

            inserts = map_fundstellen(
                satz_output.originaltexte,
                chunk_to_dokument,
                dms_to_dokument,
                satz_output.satz_id,
                satz_output.gesetz_id,
                satz_output.norm_id,
            )

            return await workflow.execute_activity(
                _write_satz_fundstellen,
                WriteSatzFundstellenInput(
                    project_id=args.project_id,
                    inserts=inserts,
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=api_retry_policy,
            )

        results = await sliding_window(
            items=satz_results_to_process,
            fn=process_one,
            concurrency=10,
        )

        total_inserted = sum(r.fundstellen_inserted for r in results)
        return InsertSucheZuordnungResultsOutput(
            fundstellen_inserted=total_inserted,
            skipped=False,
        )


async def execute_insert_suche_zuordnung_results(
    args: InsertSucheZuordnungResultsInput,
) -> InsertSucheZuordnungResultsOutput:
    return await workflow.execute_child_workflow(
        InsertSucheZuordnungResultsWorkflow.run,
        args,
        id=str(workflow.uuid4()),
        task_queue=TASK_QUEUE,
        execution_timeout=timedelta(hours=2),
        task_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(maximum_attempts=10),
    )
