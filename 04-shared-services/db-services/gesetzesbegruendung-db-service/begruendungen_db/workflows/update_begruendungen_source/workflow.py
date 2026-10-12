"""Workflow definition for ``UpdateBegruendungenSourceWorkflow``.

Lists all law docs for one source config via the list_law_docs activity, then
fans out one UpdateBegruendungenLawDocWorkflow sub-workflow per law_doc.
"""

from temporal.contracts import (
    GNDocData,
    ProcessLawDocInput,
    ProcessLawDocResult,
    UpdateBegruendungenSourceInput,
    UpdateBegruendungenSourceOutput,
)
from temporal.registry import (
    BEGRUENDUNGEN_UPDATE_LAW_DOC_WORKFLOW,
    BEGRUENDUNGEN_UPDATE_SOURCE_WORKFLOW,
)
from temporal.utils import execute_child_workflow, sliding_window
from temporalio import workflow

from begruendungen_db.workflows.update_begruendungen.activities import (
    list_law_docs,
)


@workflow.defn(name=BEGRUENDUNGEN_UPDATE_SOURCE_WORKFLOW.name)
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
            return ProcessLawDocResult.model_validate(
                await execute_child_workflow(
                    definition=BEGRUENDUNGEN_UPDATE_LAW_DOC_WORKFLOW,
                    input=ProcessLawDocInput(
                        law_doc=law_doc_data,
                        source=sc.source,
                        extra=sc.extra,
                        overwrite=sc.overwrite,
                    ),
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
