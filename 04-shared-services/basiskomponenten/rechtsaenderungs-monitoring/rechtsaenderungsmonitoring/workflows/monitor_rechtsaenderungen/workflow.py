"""Workflow definition for ``MonitorRechtsaenderungenWorkflow``.

Fan out one ``MonitorRechtsaenderungenSourceWorkflow`` sub-workflow per
configured feed source and aggregate their written/skipped/failed counts.
"""

from temporal.contracts import (
    MonitorRechtsaenderungenInput,
    MonitorRechtsaenderungenOutput,
)
from temporal.registry import (
    RECHTSAENDERUNGS_MONITORING_SOURCE_WORKFLOW,
    RECHTSAENDERUNGS_MONITORING_WORKFLOW,
)
from temporal.utils import execute_child_workflow, sliding_window
from temporalio import workflow


@workflow.defn(name=RECHTSAENDERUNGS_MONITORING_WORKFLOW.name)
class MonitorRechtsaenderungenWorkflow:
    """Refresh each configured RSS feed source via a sub-workflow."""

    @workflow.run
    async def run(self, inputs: list[MonitorRechtsaenderungenInput]) -> MonitorRechtsaenderungenOutput:
        async def run_source(
            src_input: MonitorRechtsaenderungenInput,
        ) -> MonitorRechtsaenderungenOutput:
            return MonitorRechtsaenderungenOutput.model_validate(
                await execute_child_workflow(
                    definition=RECHTSAENDERUNGS_MONITORING_SOURCE_WORKFLOW,
                    input=src_input,
                )
            )

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
