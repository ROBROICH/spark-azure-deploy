"""Workflow definition for ``MonitorRechtsaenderungenWorkflow``.

Fan out one ``MonitorRechtsaenderungenSourceWorkflow`` sub-workflow per
configured feed source and aggregate their written/skipped/failed counts.
"""

from temporal.utils import sliding_window
from temporal.workflows.rechtsaenderungs_monitoring.monitor_rechtsaenderungen import (
    MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
)
from temporal.workflows.rechtsaenderungs_monitoring.monitor_rechtsaenderungen_source import (
    execute_monitor_rechtsaenderungen_source_workflow,
)
from temporal.workflows.rechtsaenderungs_monitoring.types import (
    MonitorRechtsaenderungenInput,
    MonitorRechtsaenderungenOutput,
)
from temporalio import workflow


@workflow.defn(name=MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID)
class MonitorRechtsaenderungenWorkflow:
    """Refresh each configured RSS feed source via a sub-workflow."""

    @workflow.run
    async def run(
        self, inputs: list[MonitorRechtsaenderungenInput]
    ) -> MonitorRechtsaenderungenOutput:
        async def run_source(
            src_input: MonitorRechtsaenderungenInput,
        ) -> MonitorRechtsaenderungenOutput:
            return await execute_monitor_rechtsaenderungen_source_workflow(src_input)

        results = await sliding_window(
            items=inputs,
            fn=run_source,
            concurrency=len(inputs) or 1,
        )

        return MonitorRechtsaenderungenOutput(
            written=sum(r.written for r in results),
            skipped=sum(r.skipped for r in results),
            failed=sum(r.failed for r in results),
        )
