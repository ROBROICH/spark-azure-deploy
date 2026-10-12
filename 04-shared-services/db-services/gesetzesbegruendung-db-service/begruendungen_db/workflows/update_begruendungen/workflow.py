"""Workflow definition for ``UpdateBegruendungenWorkflow``.

Fan out one ``UpdateBegruendungenSourceWorkflow`` sub-workflow per source
config entry and aggregate written/skipped/failed counts.
"""

from temporal.contracts import (
    UpdateBegruendungenInput,
    UpdateBegruendungenOutput,
    UpdateBegruendungenSourceInput,
    UpdateBegruendungenSourceOutput,
)
from temporal.registry import (
    BEGRUENDUNGEN_UPDATE_SOURCE_WORKFLOW,
    BEGRUENDUNGEN_UPDATE_WORKFLOW,
)
from temporal.utils import execute_child_workflow, sliding_window
from temporalio import workflow


@workflow.defn(name=BEGRUENDUNGEN_UPDATE_WORKFLOW.name)
class UpdateBegruendungenWorkflow:
    """Fan out one sub-workflow per source config, then aggregate results."""

    @workflow.run
    async def run(self, input: UpdateBegruendungenInput) -> UpdateBegruendungenOutput:
        source_inputs = [UpdateBegruendungenSourceInput(source_config=sc) for sc in input.sources]

        async def run_source(
            src_input: UpdateBegruendungenSourceInput,
        ) -> UpdateBegruendungenSourceOutput:
            return UpdateBegruendungenSourceOutput.model_validate(
                await execute_child_workflow(
                    definition=BEGRUENDUNGEN_UPDATE_SOURCE_WORKFLOW,
                    input=src_input,
                )
            )

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
