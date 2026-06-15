"""Workflow definition for ``UpdateRechtsgrundlageSource``.

One sub-workflow per parser block: ingest the gesetz/verordnung/richtlinie
slugs for a single source (EU, Bund, or one Bundesland) using the parse
activity shared with the parent ``UpdateRechtsgrundlageWorkflow``.
"""

from temporal.utils import sliding_window
from temporal.workflows.gesetze_normen.types import (
    BaseRelevantLaws,
    UpdateRechtsgrundlageSourceInput,
    UpdateRechtsgrundlageSourceOutput,
)
from temporal.workflows.gesetze_normen.update_rechtsgrundlage_source import (
    UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW_ID,
)
from temporalio import workflow

from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.schemas.db import DocType
from db_pipelines.schemas.temporal import (
    NormSpec,
    ParseNormInput,
    ParseNormResult,
)
from db_pipelines.workflows.update_rechtsgrundlage.activities import (
    parse_norm,
    query_existing_norms,
)


def _collect_specs_for_block(
    block: BaseRelevantLaws,
    source: Hierarchy,
    location: Bundesland | None,
) -> list[NormSpec]:
    specs: list[NormSpec] = []
    for doctype_name in ("gesetz", "verordnung", "richtlinie"):
        slugs = getattr(block, doctype_name) or []
        doctype = DocType(doctype_name)
        for slug in slugs:
            specs.append(
                NormSpec(
                    source=source,
                    parser=block.parser,
                    base_url=block.base_url,
                    extra=block.extra,
                    slug=slug.strip(),
                    doctype=doctype,
                    bundesland=location,
                )
            )
    return specs


@workflow.defn(name=UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW_ID)
class UpdateRechtsgrundlageSourceWorkflow:
    """Ingest one parser-block (EU, Bund, or a single Bundesland)."""

    @workflow.run
    async def run(self, input: UpdateRechtsgrundlageSourceInput) -> UpdateRechtsgrundlageSourceOutput:
        source = Hierarchy(input.source.value)
        location = Bundesland(input.location.value) if input.location is not None else None
        specs = _collect_specs_for_block(input.laws, source, location)

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
