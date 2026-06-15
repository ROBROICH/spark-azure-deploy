"""Workflow definition for ``UpdateBegruendungenSourceWorkflow``.

Lists all law docs for one source config via the list_law_docs activity, then
fans out one UpdateBegruendungenLawDocWorkflow sub-workflow per law_doc.
"""

from temporal.utils import sliding_window
from temporal.workflows.begruendungen.types import (
    GNDocData,
    ProcessLawDocInput,
    ProcessLawDocResult,
    UpdateBegruendungenSourceInput,
    UpdateBegruendungenSourceOutput,
)
from temporal.workflows.begruendungen.update_begruendungen_source import (
    UPDATE_BEGRUENDUNGEN_SOURCE_WORKFLOW_ID,
)
from temporal.workflows.begruendungen.update_begruendungen_law_doc import (
    execute_update_begruendungen_law_doc_workflow,
)
from temporalio import workflow

from begruendungen_db.workflows.update_begruendungen.activities import (
    list_law_docs,
)


@workflow.defn(name=UPDATE_BEGRUENDUNGEN_SOURCE_WORKFLOW_ID)
class UpdateBegruendungenSourceWorkflow:
    """List law docs for one source config, then fan out a sub-workflow per law_doc."""

    @workflow.run
    async def run(self, input: UpdateBegruendungenSourceInput) -> UpdateBegruendungenSourceOutput:
        sc = input.source_config
        law_docs = await list_law_docs(
            hierarchy=sc.hierarchy.value,
            bundesland=sc.bundesland.value if sc.bundesland else None,
        )

        async def run_law_doc(law_doc_data: GNDocData) -> ProcessLawDocResult:
            return await execute_update_begruendungen_law_doc_workflow(
                ProcessLawDocInput(
                    law_doc=law_doc_data,
                    source=sc.source,
                    extra=sc.extra,
                    overwrite=sc.overwrite,
                )
            )

        results = await sliding_window(
            items=law_docs,
            fn=run_law_doc,
            concurrency=5,
        )

        return UpdateBegruendungenSourceOutput(
            written=sum(r.written for r in results),
            skipped=sum(r.skipped for r in results),
            failed=sum(r.failed for r in results),
        )
