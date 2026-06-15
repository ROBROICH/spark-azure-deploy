"""DeleteDocumentsWorkflow — deletes selected DMS documents and related derived data."""

import logging
from dataclasses import dataclass, field
from uuid import UUID

from temporal.workflows.inhaltsextraktion.types import (
    DeleteDocumentsWorkflowInput,
    DeleteDocumentsWorkflowOutput,
)
from temporalio import activity, workflow

from src.activities.deletion import (
    delete_single_document_from_dms,
    delete_single_file_qdrant,
    list_project_files_for_deletion,
    update_summary_for_deleted_documents,
)
from src.workflows.deletion.types import (
    DeletionFileInfo,
    DMSDeleteSingleDocumentInput,
    QdrantDocumentDeleteInput,
    UpdateSummaryInput,
)

# Fallback logger for when not in Temporal activity context
_module_logger = logging.getLogger(__name__)


def _get_logger() -> logging.Logger | logging.LoggerAdapter:  # type: ignore[type-arg]
    """Get appropriate logger - activity logger if in activity context, else module logger."""
    if activity.in_activity():
        return activity.logger
    return _module_logger


logger = _get_logger()
delete_documents_workflow_id = "delete-documents-workflow"


@dataclass
class _DeletionResults:
    """Aggregated results across all per-file deletions."""

    documents_deleted: list[str] = field(default_factory=list)
    documents_failed: list[str] = field(default_factory=list)
    content_extractions_deleted: list[str] = field(default_factory=list)
    content_extractions_failed: list[str] = field(default_factory=list)
    qdrant_deleted: list[str] = field(default_factory=list)
    qdrant_failed: list[str] = field(default_factory=list)
    summary_filenames: list[str] = field(default_factory=list)


async def _delete_single_file(
    file_obj: DeletionFileInfo,
    existing_content_extractions: list[DeletionFileInfo],
    project_id: UUID,
    results: _DeletionResults,
) -> None:
    """Delete one file from Qdrant and DMS, accumulating results."""
    qdrant_success = await delete_single_file_qdrant(
        QdrantDocumentDeleteInput(project_id=project_id, document_file=file_obj)
    )
    if not qdrant_success:
        results.qdrant_failed.append(file_obj.filename)
        logger.error("Skipping DMS deletion and summary update for %s because Qdrant deletion failed", file_obj.filename)
        return

    results.qdrant_deleted.append(file_obj.filename)

    try:
        dms_result = await delete_single_document_from_dms(
            DMSDeleteSingleDocumentInput(
                project_id=project_id,
                document_file=file_obj,
                existing_content_extractions=existing_content_extractions,
            )
        )
    except Exception as exc:
        results.documents_failed.append(file_obj.filename)
        logger.error("Skipping summary update for %s because DMS deletion failed: %s", file_obj.filename, exc)
        return

    results.documents_deleted.extend(dms_result.documents_deleted)
    results.documents_failed.extend(dms_result.documents_failed)
    results.content_extractions_deleted.extend(dms_result.content_extractions_deleted)
    results.content_extractions_failed.extend(dms_result.content_extractions_failed)

    if file_obj.filename in dms_result.documents_deleted:
        results.summary_filenames.append(dms_result.document_filename)


@workflow.defn(name=delete_documents_workflow_id)
class DeleteDocumentsWorkflow:
    """Workflow that deletes selected DMS documents and related derived data.

    The workflow soft-deletes the specified document files,
    their related content extraction files, updates ``summary.json``, and
    soft-deletes the corresponding Qdrant points.
    """

    @workflow.run
    async def run(self, input: DeleteDocumentsWorkflowInput) -> DeleteDocumentsWorkflowOutput:
        """Run the deletion workflow for selected files in a project."""
        logger.info("Running delete workflow for project %s", input.project_id)

        if not input.file_ids:
            logger.info("No file_ids provided. Nothing to delete.")
            return DeleteDocumentsWorkflowOutput(project_id=input.project_id)

        project_files = await list_project_files_for_deletion(input.project_id)
        existing_documents = project_files["documents"]
        existing_content_extractions = project_files["content_extractions"]

        existing_by_id = {f.file_id: f for f in existing_documents}
        files_to_delete = [existing_by_id[str(fid)] for fid in input.file_ids if str(fid) in existing_by_id]

        results = _DeletionResults()
        for file_obj in files_to_delete:
            await _delete_single_file(file_obj, existing_content_extractions, input.project_id, results)

        summary_update_success: list[str] = []
        summary_update_failed: list[str] = []
        if results.summary_filenames:
            summary_result = await update_summary_for_deleted_documents(
                UpdateSummaryInput(project_id=input.project_id, deleted_document_filenames=results.summary_filenames)
            )
            summary_update_success = summary_result.success
            summary_update_failed = summary_result.failed

        return DeleteDocumentsWorkflowOutput(
            project_id=input.project_id,
            documents_deleted=results.documents_deleted,
            documents_failed=results.documents_failed,
            content_extractions_deleted=results.content_extractions_deleted,
            content_extractions_failed=results.content_extractions_failed,
            summary_update_success=summary_update_success,
            summary_update_failed=summary_update_failed,
            qdrant_deleted=results.qdrant_deleted,
            qdrant_failed=results.qdrant_failed,
        )
