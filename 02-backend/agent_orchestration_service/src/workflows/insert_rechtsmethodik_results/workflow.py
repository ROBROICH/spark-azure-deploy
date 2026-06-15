from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.insert_rechtsmethodik_results.activity import (
    _build_inserts_and_updates,
    _fetch_examination_rechtsmethodik_context,
    _fetch_pls_topic_norms,
    _insert_rechtsmethodik_result,
)
from src.workflows.insert_rechtsmethodik_results.types import (
    InsertRechtsmethodikResultOutput,
    InsertRechtsmethodikResultsInput,
    WriteRechtsmethodikResultInput,
)

fetch_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=10),
)
insert_retry_policy = RetryPolicy(
    maximum_attempts=1,
)
MAX_INSERT_RECONCILE_ATTEMPTS = 5


@workflow.defn(name="InsertRechtsmethodikResultsWorkflow")
class InsertRechtsmethodikResultsWorkflow:
    @workflow.run
    async def run(self, args: InsertRechtsmethodikResultsInput) -> list[InsertRechtsmethodikResultOutput]:
        if not args.norm_results:
            return []

        topic_norms = await workflow.execute_activity(
            _fetch_pls_topic_norms,
            args.project_id,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=fetch_retry_policy,
        )

        results: list[InsertRechtsmethodikResultOutput] = []
        for norm_result in args.norm_results:
            result: InsertRechtsmethodikResultOutput | None = None
            for attempt in range(MAX_INSERT_RECONCILE_ATTEMPTS):
                context = await workflow.execute_activity(
                    _fetch_examination_rechtsmethodik_context,
                    args.project_id,
                    start_to_close_timeout=timedelta(seconds=300),
                    retry_policy=fetch_retry_policy,
                )
                inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
                    project_id=args.project_id,
                    norm_result=norm_result,
                    context=context,
                    topic_norms=topic_norms,
                )
                if not inserts and not updates:
                    result = InsertRechtsmethodikResultOutput(
                        gesetz_id=gesetz_id,
                        norm_id=norm_id,
                        skipped=True,
                        nodes_inserted=0,
                    )
                    break
                try:
                    result = await workflow.execute_activity(
                        _insert_rechtsmethodik_result,
                        WriteRechtsmethodikResultInput(
                            project_id=args.project_id,
                            inserts=inserts,
                            updates=updates,
                            gesetz_id=gesetz_id,
                            norm_id=norm_id,
                        ),
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=insert_retry_policy,
                    )
                    break
                except Exception:
                    if attempt == MAX_INSERT_RECONCILE_ATTEMPTS - 1:
                        raise
                    await workflow.sleep(timedelta(seconds=2))
            if result is None:
                raise RuntimeError("Rechtsmethodik insert did not produce a result")
            results.append(result)

        return results


async def insert_rechtsmethodik_results(args: InsertRechtsmethodikResultsInput) -> None:
    await workflow.execute_child_workflow(
        InsertRechtsmethodikResultsWorkflow.run,
        args,
        id=str(workflow.uuid4()),
    )
