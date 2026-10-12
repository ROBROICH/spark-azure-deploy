"""Workflow definition for ``UpdateRechtsgrundlageWorkflow``.

Re-implements ``db_pipelines.cli.parse_to_db`` on top of Temporal: fan out
one ``UpdateRechtsgrundlageSource`` sub-workflow per parser block (EU,
Bund, and one per Bundesland) and aggregate their written/skipped counts.
"""

from temporal.contracts import (
    GesetzeNormenSource,
    RelevantLaws,
    UpdateRechtsgrundlageInput,
    UpdateRechtsgrundlageOutput,
    UpdateRechtsgrundlageSourceInput,
    UpdateRechtsgrundlageSourceOutput,
)
from temporal.registry import (
    GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW,
    GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_WORKFLOW,
)
from temporal.utils import execute_child_workflow, sliding_window
from temporalio import workflow

from db_pipelines.norm_specs import state_law_blocks


def _build_source_inputs(
    relevant_laws: RelevantLaws,
    overwrite: bool,
) -> list[UpdateRechtsgrundlageSourceInput]:
    """One sub-workflow input per parser block: EU, Bund, and per-Bundesland."""
    inputs: list[UpdateRechtsgrundlageSourceInput] = []
    if relevant_laws.eu:
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=GesetzeNormenSource.EU,
                laws=relevant_laws.eu,
                location=None,
                overwrite=overwrite,
            )
        )
    if relevant_laws.bund:
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=GesetzeNormenSource.BUND,
                laws=relevant_laws.bund,
                location=None,
                overwrite=overwrite,
            )
        )

    for state_config in state_law_blocks(relevant_laws):
        inputs.append(
            UpdateRechtsgrundlageSourceInput(
                source=GesetzeNormenSource.BUNDESLAND,
                laws=state_config,
                location=state_config.name,
                overwrite=overwrite,
            )
        )
    return inputs


@workflow.defn(name=GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_WORKFLOW.name)
class UpdateRechtsgrundlageWorkflow:
    """Ingest the configured EU/Bund/Bundeslaender laws into the database."""

    @workflow.run
    async def run(self, input: UpdateRechtsgrundlageInput) -> UpdateRechtsgrundlageOutput:
        source_inputs = _build_source_inputs(input.pipeline_config, input.overwrite)

        async def run_source(
            src_input: UpdateRechtsgrundlageSourceInput,
        ) -> UpdateRechtsgrundlageSourceOutput:
            return UpdateRechtsgrundlageSourceOutput.model_validate(
                await execute_child_workflow(
                    definition=GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW,
                    input=src_input,
                )
            )

        results = await sliding_window(
            items=source_inputs,
            fn=run_source,
            concurrency=len(source_inputs) or 1,
        )

        return UpdateRechtsgrundlageOutput(
            written=sum(r.written for r in results),
            skipped=sum(r.skipped for r in results),
        )
