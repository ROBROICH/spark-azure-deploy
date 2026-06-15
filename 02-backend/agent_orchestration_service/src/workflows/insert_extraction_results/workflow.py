from datetime import timedelta
from uuid import UUID

from temporalio import workflow

from src.workflows.insert_extraction_results.activity import (
    batch_insert_extraction_nodes,
)
from src.workflows.insert_extraction_results.mapper import (
    map_processed_document_nodes,
)
from src.workflows.insert_extraction_results.types import (
    BatchInsertExtractionInput,
    DocumentExtractionEntry,
    InsertDocumentExtractionInput,
    InsertDocumentExtractionOutput,
    InsertExtractionResultsInput,
)


@workflow.defn(name="InsertExtractionResultsWorkflow")
class InsertExtractionResultsWorkflow:
    @workflow.run
    async def run(self, args: InsertExtractionResultsInput) -> list[InsertDocumentExtractionOutput]:
        entries: list[DocumentExtractionEntry] = []

        for file_info in args.processed_files:
            if not file_info.processed_document:
                continue
            source_file_id = file_info.processed_document.metadata.source_file_id
            if not source_file_id:
                continue

            mapped_dokument_id = args.dokument_id_by_file_id.get(str(source_file_id))
            dokument_id_override = UUID(mapped_dokument_id) if mapped_dokument_id else None

            inserts = map_processed_document_nodes(
                InsertDocumentExtractionInput(
                    project_id=args.project_id,
                    processed_file_info=file_info,
                ),
                dokument_id_override=dokument_id_override,
            )

            dokument_insert = next((i for i in inserts if i["node_type"] == "dokument"), None)
            if dokument_insert is None:
                raise ValueError("Mapped inserts are missing a 'dokument' node")

            entries.append(
                DocumentExtractionEntry(
                    dokument_id=UUID(dokument_insert["id"]),
                    source_file_id=UUID(source_file_id),
                    has_dokument_id_override=dokument_id_override is not None,
                    inserts=inserts,
                )
            )

        if not entries:
            return []

        output = await batch_insert_extraction_nodes(
            BatchInsertExtractionInput(
                project_id=args.project_id,
                entries=entries,
            )
        )
        return output.results


async def insert_extraction_results(args: InsertExtractionResultsInput) -> None:
    await workflow.execute_child_workflow(
        InsertExtractionResultsWorkflow.run,
        args,
        id=str(workflow.uuid4()),
        task_timeout=timedelta(seconds=60),
    )
