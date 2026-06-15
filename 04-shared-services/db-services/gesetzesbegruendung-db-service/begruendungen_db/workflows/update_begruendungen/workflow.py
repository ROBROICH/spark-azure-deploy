"""Workflow definition for ``UpdateBegruendungenWorkflow``.

Fan out one ``UpdateBegruendungenSourceWorkflow`` sub-workflow per source
config entry and aggregate written/skipped/failed counts.
"""

from temporal.utils import sliding_window
from temporal.workflows.begruendungen.types import (
    UpdateBegruendungenInput,
    UpdateBegruendungenOutput,
    UpdateBegruendungenSourceInput,
    UpdateBegruendungenSourceOutput,
)
from temporal.workflows.begruendungen.update_begruendungen import (
    UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
)
from temporal.workflows.begruendungen.update_begruendungen_source import (
    execute_update_begruendungen_source_workflow,
)
from temporalio import workflow


@workflow.defn(name=UPDATE_BEGRUENDUNGEN_WORKFLOW_ID)
class UpdateBegruendungenWorkflow:
    """Fan out one sub-workflow per source config, then aggregate results."""

    @workflow.run
    async def run(self, input: UpdateBegruendungenInput) -> UpdateBegruendungenOutput:
        source_inputs = [
            UpdateBegruendungenSourceInput(source_config=sc)
            for sc in input.sources
        ]

        async def run_source(
            src_input: UpdateBegruendungenSourceInput,
        ) -> UpdateBegruendungenSourceOutput:
            return await execute_update_begruendungen_source_workflow(src_input)

        results = await sliding_window(
            items=source_inputs,
            fn=run_source,
            concurrency=len(source_inputs) or 1,
        )

        return UpdateBegruendungenOutput(
            written=sum(r.written for r in results),
            skipped=sum(r.skipped for r in results),
            failed=sum(r.failed for r in results),
        )
