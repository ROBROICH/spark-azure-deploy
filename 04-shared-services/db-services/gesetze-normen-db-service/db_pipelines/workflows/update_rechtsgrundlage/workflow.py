"""Workflow definition for ``UpdateRechtsgrundlageWorkflow``.

Re-implements ``db_pipelines.cli.parse_to_db`` on top of Temporal: fan out
one ``UpdateRechtsgrundlageSource`` sub-workflow per parser block (EU,
Bund, and one per Bundesland) and aggregate their written/skipped counts.
"""

from temporal.utils import sliding_window
from temporal.workflows.gesetze_normen.types import (
    RelevantLaws,
    Source,
    StateRelevantLaws,
    UpdateRechtsgrundlageInput,
    UpdateRechtsgrundlageOutput,
    UpdateRechtsgrundlageSourceInput,
    UpdateRechtsgrundlageSourceOutput,
)
from temporal.workflows.gesetze_normen.update_rechtsgrundlage import (
    UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID,
)
from temporal.workflows.gesetze_normen.update_rechtsgrundlage_source import (
    execute_update_rechtsgrundlage_source_workflow,
)
from temporalio import workflow


def _build_source_inputs(
    relevant_laws: RelevantLaws,
    overwrite: bool,
) -> list[UpdateRechtsgrundlageSourceInput]:
    """One sub-workflow input per parser block: EU, Bund, and per-Bundesland."""
    inputs: list[UpdateRechtsgrundlageSourceInput] = []
    if relevant_laws.eu:
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=Source.EU,
                laws=relevant_laws.eu,
                location=None,
                overwrite=overwrite,
            )
        )
    if relevant_laws.bund:
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=Source.BUND,
                laws=relevant_laws.bund,
                location=None,
                overwrite=overwrite,
            )
        )

    state_configs: list[StateRelevantLaws] = []
    if relevant_laws.bundeslaender:
        state_configs = list(relevant_laws.bundeslaender)
    elif relevant_laws.bundesland:
        state_configs = [relevant_laws.bundesland]

    for state_config in state_configs:
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=Source.BUNDESLAND,
                laws=state_config,
                location=state_config.name,
                overwrite=overwrite,
            )
        )
    return inputs


@workflow.defn(name=UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID)
class UpdateRechtsgrundlageWorkflow:
    """Ingest the configured EU/Bund/Bundeslaender laws into the database."""

    @workflow.run
    async def run(self, input: UpdateRechtsgrundlageInput) -> UpdateRechtsgrundlageOutput:
        source_inputs = _build_source_inputs(input.pipeline_config, input.overwrite)

        async def run_source(
            src_input: UpdateRechtsgrundlageSourceInput,
        ) -> UpdateRechtsgrundlageSourceOutput:
            return await execute_update_rechtsgrundlage_source_workflow(src_input)

        results = await sliding_window(
            items=source_inputs,
            fn=run_source,
            concurrency=len(source_inputs) or 1,
        )

        return UpdateRechtsgrundlageOutput(
            written=sum(r.written for r in results),
            skipped=sum(r.skipped for r in results),
        )
