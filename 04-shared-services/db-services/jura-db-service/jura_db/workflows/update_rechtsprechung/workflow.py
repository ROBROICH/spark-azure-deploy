"""Workflow definition for ``UpdateRechtsprechungWorkflow``.

Re-implements ``jura_db.cli.download_all`` on top of Temporal: list the TOC,
snapshot the already-ingested doc_ids, then download + parse + persist each
entry through the activities defined alongside this module.
"""

from temporal.contracts import (
    UpdateRechtsprechungInput,
    UpdateRechtsprechungOutput,
)
from temporal.registry import JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow

from jura_db.schemas.temporal import (
    ProcessRechtsprechungInput,
    ProcessRechtsprechungResult,
    RechtsprechungSpec,
)
from jura_db.workflows.update_rechtsprechung.activities import (
    list_rechtsprechung,
    process_rechtsprechung,
    query_existing_doc_ids,
)


@workflow.defn(name=JURA_DB_UPDATE_RECHTSPRECHUNG_WORKFLOW.name)
class UpdateRechtsprechungWorkflow:
    """Ingest the full RII TOC of court decisions into the database."""

    @workflow.run
    async def run(self, input: UpdateRechtsprechungInput) -> UpdateRechtsprechungOutput:
        specs: list[RechtsprechungSpec] = await list_rechtsprechung()
        if input.max_documents is not None or input.offset is not None:
            start = input.offset or 0
            if input.max_documents is not None:
                end = start + input.max_documents
            else:
                end = len(specs)
            specs = specs[start:end]
        existing_doc_ids = await query_existing_doc_ids()

        async def process(spec: RechtsprechungSpec) -> ProcessRechtsprechungResult:
            return await process_rechtsprechung(
                ProcessRechtsprechungInput(spec=spec, overwrite=input.overwrite, existing_doc_ids=existing_doc_ids)
            )

        results = await sliding_window(items=specs, fn=process, concurrency=5)

        return UpdateRechtsprechungOutput(
            written=sum(1 for r in results if r.status == "written"),
            skipped=sum(1 for r in results if r.status == "skipped"),
            duplicate=sum(1 for r in results if r.status == "duplicate"),
            failed=sum(1 for r in results if r.status == "failed"),
        )
