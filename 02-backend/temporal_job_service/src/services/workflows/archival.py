from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.services.workflows.activities.activity_models import (
        ArchiveOneInput,
        ListUnarchivedBatchInput,
        UnarchivedRow,
    )
    from src.services.workflows.activities.archival import (
        archive_one,
        list_unarchived_batch,
    )
    from src.services.workflows.workflow_models import (
        WeeklyArchivalInput,
        WeeklyArchivalOutput,
    )


@workflow.defn(name="WeeklyArchivalWorkflow")
class WeeklyArchivalWorkflow:
    """Pulls batches of unarchived terminal workflows and archives them.

    The workflow runs indefinitely, picking up remaining work on the next tick.
    """

    @workflow.run
    async def run(self, workflow_input: WeeklyArchivalInput) -> WeeklyArchivalOutput:
        archived = workflow_input.archived_so_far
        failed = workflow_input.failed_so_far
        failed_keys: list[tuple[str, str]] = [(wid, rid) for wid, rid in workflow_input.failed_keys]
        while True:
            batch: list[UnarchivedRow] = await workflow.execute_activity(
                list_unarchived_batch,
                ListUnarchivedBatchInput(
                    batch_size=workflow_input.batch_size,
                    excluded_keys=failed_keys,
                ),
                schedule_to_close_timeout=timedelta(minutes=2),
            )
            if not batch:
                break
            for row in batch:
                try:
                    s3_key = await workflow.execute_activity(
                        archive_one,
                        ArchiveOneInput(row=row),
                        start_to_close_timeout=timedelta(minutes=15),
                        schedule_to_close_timeout=timedelta(minutes=20),
                        heartbeat_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=3),
                    )
                except Exception:
                    workflow.logger.exception("archival failed for %s/%s", row.workflow_id, row.run_id)
                    failed += 1
                    failed_keys.append((row.workflow_id, row.run_id))
                    continue
                if s3_key:
                    archived += 1
                else:
                    failed += 1
                    failed_keys.append((row.workflow_id, row.run_id))

            if workflow.info().is_continue_as_new_suggested():
                workflow.continue_as_new(
                    WeeklyArchivalInput(
                        batch_size=workflow_input.batch_size,
                        failed_so_far=failed,
                        archived_so_far=archived,
                        failed_keys=failed_keys,
                    )
                )
        return WeeklyArchivalOutput(archived=archived, failed=failed)
