"""Workflow definition for ``UpdateRechtsgrundlageSource``.

One sub-workflow per parser block: ingest the gesetz/verordnung/richtlinie/
verwaltungsvorschrift slugs for a single source (EU, Bund, or one Bundesland)
using the parse activity shared with the parent ``UpdateRechtsgrundlageWorkflow``.
"""

from temporal.contracts import (
    UpdateRechtsgrundlageSourceInput,
    UpdateRechtsgrundlageSourceOutput,
)
from temporal.registry import GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow

from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.norm_specs import (
    INGESTED_DOCTYPES,
    PRE_VERWALTUNGSVORSCHRIFT_DOCTYPES,
    norm_specs_for_block,
)
from db_pipelines.schemas.temporal import (
    NormSpec,
    ParseNormInput,
    ParseNormResult,
)
from db_pipelines.workflows.update_rechtsgrundlage.activities import (
    parse_norm,
)


@workflow.defn(name=GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW.name)
class UpdateRechtsgrundlageSourceWorkflow:
    """Ingest one parser-block (EU, Bund, or a single Bundesland)."""

    @workflow.run
    async def run(self, input: UpdateRechtsgrundlageSourceInput) -> UpdateRechtsgrundlageSourceOutput:
        source = Hierarchy(input.source.value)
        location = Bundesland(input.location.value) if input.location is not None else None
        doctypes = (
            INGESTED_DOCTYPES
            if workflow.patched("rechtsgrundlage-source-verwaltungsvorschriften")
            else PRE_VERWALTUNGSVORSCHRIFT_DOCTYPES
        )
        specs = norm_specs_for_block(input.laws, source, location, doctypes)

        async def process(spec: NormSpec) -> ParseNormResult:
            return await parse_norm(
                ParseNormInput(
                    spec=spec,
                    overwrite=input.overwrite,
                )
            )

        results = await sliding_window(items=specs, fn=process, concurrency=5)

        return UpdateRechtsgrundlageSourceOutput(
            written=sum(1 for r in results if r.status == "written"),
            skipped=sum(1 for r in results if r.status == "skipped"),
        )
