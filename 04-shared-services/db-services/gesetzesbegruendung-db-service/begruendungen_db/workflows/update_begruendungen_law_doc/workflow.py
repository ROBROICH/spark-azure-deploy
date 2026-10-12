"""Workflow definition for ``UpdateBegruendungenLawDocWorkflow``.

Fetches all document metadata for one law_doc via the fetch_law_docs activity,
then fans out one process_law_doc activity per document and aggregates results.
"""

from typing import Any

from temporal.contracts import (
    ProcessLawDocInput,
    ProcessLawDocResult,
    ProcessSingleDocInput,
    ProcessSingleDocResult,
)
from temporal.registry import BEGRUENDUNGEN_UPDATE_LAW_DOC_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow

from begruendungen_db.workflows.update_begruendungen.activities import (
    fetch_law_docs,
    process_law_doc,
)


@workflow.defn(name=BEGRUENDUNGEN_UPDATE_LAW_DOC_WORKFLOW.name)
class UpdateBegruendungenLawDocWorkflow:
    """Fetch document metadata for one law_doc, then fan out one process_law_doc per document."""

    @workflow.run
    async def run(self, input: ProcessLawDocInput) -> ProcessLawDocResult:
        document_metas = await fetch_law_docs(input)

        if not document_metas:
            return ProcessLawDocResult(
                jurabk=input.law_doc.jurabk,
                written=0,
                skipped=0,
                failed=0,
            )

        async def process_single(doc_meta: dict[str, Any]) -> ProcessSingleDocResult:
            return await process_law_doc(
                ProcessSingleDocInput(
                    law_doc=input.law_doc,
                    source=input.source,
                    extra=input.extra,
                    overwrite=input.overwrite,
                    document_meta=doc_meta,
                )
            )

        results = await sliding_window(
            items=document_metas,
            fn=process_single,
            concurrency=5,
        )

        return ProcessLawDocResult(
            jurabk=input.law_doc.jurabk,
            written=sum(r.status == "written" for r in results),
            skipped=sum(r.status == "skipped" for r in results),
            failed=sum(r.status == "failed" for r in results),
        )
