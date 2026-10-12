"""Temporal activities for deleting selected DMS documents and related Qdrant data."""

import os
from datetime import timedelta
from uuid import UUID

from temporal.contracts import SummaryData
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.qdrant.indexing import _delete_document_by_source_file_id
from src.config import get_config
from src.utils.dms_utils import delete_file, download_file, list_all_files
from src.utils.summary_file import (
    SUMMARY_FILENAME,
    list_summary_files,
    replace_summary_file,
    serialize_summary,
)
from src.workflows.deletion.types import (
    CleanupContentExtractionsInput,
    CleanupContentExtractionsResult,
    DeletionFileInfo,
    DMSDeleteSingleDocumentInput,
    DMSDeleteSingleDocumentResult,
    QdrantDocumentDeleteInput,
    UpdateSummaryInput,
    UpdateSummaryResult,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _delete_matching_extractions(
    document_base: str,
    extraction_files: list[DeletionFileInfo],
) -> tuple[list[str], list[str]]:
    """Delete extraction files whose directory matches document_base or document_base/images."""
    deleted: list[str] = []
    failed: list[str] = []
    for extraction_file in extraction_files:
        extraction_dir = os.path.dirname(extraction_file.filename)
        if extraction_dir not in (document_base, f"{document_base}/images"):
            continue
        try:
            await delete_file(UUID(extraction_file.file_id))
            deleted.append(extraction_file.filename)
        except Exception as exc:
            activity.logger.exception(
                "Failed to delete content extraction %s (%s): %s",
                extraction_file.filename,
                extraction_file.file_id,
                exc,
            )
            failed.append(extraction_file.filename)
    return deleted, failed


async def _list_all_files(
    project_id: UUID,
    file_type: str,
) -> list[DeletionFileInfo]:
    """List all DMS files for a project and file type."""
    return [
        DeletionFileInfo(
            file_id=str(file_obj.id),
            filename=file_obj.filename,
            file_type=file_obj.type,
        )
        for file_obj in await list_all_files(project_id, file_type)
    ]


# ---------------------------------------------------------------------------
# Activity implementations
# ---------------------------------------------------------------------------


@activity.defn(name="list_project_files_for_deletion")
async def _list_project_files_for_deletion(
    project_id: UUID,
) -> dict[str, list[DeletionFileInfo]]:
    """List all document and content_extraction files for a project."""
    documents = await _list_all_files(project_id, "document")
    content_extractions = await _list_all_files(project_id, "content_extraction")

    activity.logger.info(
        "Found %d document files and %d content_extraction files for project %s",
        len(documents),
        len(content_extractions),
        project_id,
    )

    return {
        "documents": documents,
        "content_extractions": content_extractions,
    }


@activity.defn(name="delete_single_document_from_dms")
async def _delete_single_document_from_dms(
    input: DMSDeleteSingleDocumentInput,
) -> DMSDeleteSingleDocumentResult:
    """Delete one document and all related content_extraction files from DMS."""
    filename = input.document_file.filename
    file_id = UUID(input.document_file.file_id)
    document_base = os.path.splitext(filename)[0]

    content_extractions_deleted, content_extractions_failed = await _delete_matching_extractions(
        document_base, input.existing_content_extractions
    )

    documents_deleted: list[str] = []
    documents_failed: list[str] = []
    try:
        await delete_file(file_id)
        documents_deleted.append(filename)
    except Exception as exc:
        activity.logger.exception("Failed to delete document %s (%s): %s", filename, file_id, exc)
        documents_failed.append(filename)

    return DMSDeleteSingleDocumentResult(
        document_filename=filename,
        documents_deleted=documents_deleted,
        documents_failed=documents_failed,
        content_extractions_deleted=content_extractions_deleted,
        content_extractions_failed=content_extractions_failed,
    )


@activity.defn(name="cleanup_content_extractions_dms")
async def _cleanup_content_extractions_dms(
    input: CleanupContentExtractionsInput,
) -> CleanupContentExtractionsResult:
    """Delete old derived DMS outputs for a document filename and remove it from summary.json."""
    filename = input.filename
    document_base = os.path.splitext(filename)[0]

    content_extractions = await _list_all_files(input.project_id, "content_extraction")
    content_extractions_deleted, content_extractions_failed = await _delete_matching_extractions(
        document_base, content_extractions
    )

    summary_result = await _update_summary_for_deleted_documents(
        UpdateSummaryInput(
            project_id=input.project_id,
            deleted_document_filenames=[filename],
        )
    )

    return CleanupContentExtractionsResult(
        content_extractions_deleted=content_extractions_deleted,
        content_extractions_failed=content_extractions_failed,
        summary_update_success=summary_result.success,
        summary_update_failed=summary_result.failed,
    )


@activity.defn(name="update_summary_for_deleted_documents")
async def _update_summary_for_deleted_documents(
    input: UpdateSummaryInput,
) -> UpdateSummaryResult:
    """Remove deleted documents from summary.json."""
    requested_filenames = input.deleted_document_filenames
    summary_files = await list_summary_files(input.project_id)
    if not summary_files:
        activity.logger.info("No %s found for project %s", SUMMARY_FILENAME, input.project_id)
        return UpdateSummaryResult(success=[], failed=requested_filenames)

    summary_file = summary_files[0]
    try:
        existing_bytes = await download_file(summary_file.id)
        summary = SummaryData.model_validate_json(existing_bytes)
    except FileNotFoundError:
        activity.logger.warning(
            "Found %s metadata (file_id=%s) but file not found in storage",
            SUMMARY_FILENAME,
            summary_file.id,
        )
        return UpdateSummaryResult(success=[], failed=requested_filenames)

    filenames_to_remove = set(requested_filenames)
    removed_filenames = {
        entry.document_path for entry in summary.processed_files if entry.document_path in filenames_to_remove
    }
    failed_filenames = [name for name in requested_filenames if name not in removed_filenames]

    if not removed_filenames:
        activity.logger.info("summary.json did not contain entries for deleted files: %s", requested_filenames)
        return UpdateSummaryResult(success=[], failed=failed_filenames)

    summary = summary.model_copy(
        update={
            "processed_files": [
                entry for entry in summary.processed_files if entry.document_path not in filenames_to_remove
            ]
        }
    )
    await replace_summary_file(input.project_id, serialize_summary(summary), summary_files)

    return UpdateSummaryResult(
        success=[name for name in requested_filenames if name in removed_filenames],
        failed=failed_filenames,
    )


# ---------------------------------------------------------------------------
# Workflow wrapper functions
# ---------------------------------------------------------------------------


async def list_project_files_for_deletion(
    project_id: UUID,
) -> dict[str, list[DeletionFileInfo]]:
    """Workflow wrapper for listing project files relevant to deletion."""
    return await workflow.execute_activity(
        _list_project_files_for_deletion,
        project_id,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS,
        ),
    )


async def delete_single_document_from_dms(
    input: DMSDeleteSingleDocumentInput,
) -> DMSDeleteSingleDocumentResult:
    """Workflow wrapper for deleting one document and related DMS files."""
    return await workflow.execute_activity(
        _delete_single_document_from_dms,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS,
        ),
    )


async def cleanup_content_extractions_dms(
    input: CleanupContentExtractionsInput,
) -> CleanupContentExtractionsResult:
    """Workflow wrapper for deleting old derived outputs of a document by filename."""
    return await workflow.execute_activity(
        _cleanup_content_extractions_dms,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS,
        ),
    )


async def update_summary_for_deleted_documents(
    input: UpdateSummaryInput,
) -> UpdateSummaryResult:
    """Workflow wrapper for updating summary.json after document deletions."""
    return await workflow.execute_activity(
        _update_summary_for_deleted_documents,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS,
        ),
    )


async def delete_single_file_qdrant(
    input: QdrantDocumentDeleteInput,
) -> bool:
    """Workflow wrapper for deleting Qdrant points of a single file."""
    document_filename = input.document_file.filename

    try:
        return await workflow.execute_activity(
            _delete_document_by_source_file_id,
            input,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                maximum_attempts=get_config().TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS,
            ),
        )
    except Exception as exc:
        activity.logger.exception(
            "Failed to soft-delete Qdrant points for %s (%s): %s",
            document_filename,
            input.document_file.file_id,
            exc,
        )
        return False
