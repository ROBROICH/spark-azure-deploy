"""Summary creation activity."""

import json
from datetime import timedelta
from uuid import UUID

from temporal.workflows.inhaltsextraktion.types import BaseMetadata, ProcessedFileInfo, SummaryData
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.postprocessing.schemas import (
    CreateSummaryFromResultsInput,
    SummaryResult,
)
from src.config import get_config
from src.utils.dms_utils import (
    DmsUploadInput,
    FileObject,
    ListFilesInput,
    delete_file,
    download_file,
    list_files,
    upload_file,
)

__all__ = [
    "_create_summary_from_results",
    "create_summary_from_results",
]

SUMMARY_FILENAME = "summary.json"


_PAGE_SIZE = 500


async def _list_all_files(project_id: UUID, file_type: str) -> list[FileObject]:
    """Fetch all pages from DMS list_files endpoint."""
    page = 1
    all_files: list[FileObject] = []
    while True:
        batch = await list_files(
            ListFilesInput(project_id=project_id, file_type=file_type, page=page, page_size=_PAGE_SIZE)
        )
        all_files.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
        page += 1
    return all_files


async def _find_existing_summary_id(
    project_id: UUID,
) -> UUID | None:
    """Find existing summary.json row in DMS, if any."""
    files = await _list_all_files(project_id, "content_extraction")
    for file_obj in files:
        if file_obj.filename == SUMMARY_FILENAME:
            return file_obj.id
    return None


async def _load_existing_summary_entries(
    existing_file_id: UUID | None,
) -> list[ProcessedFileInfo]:
    """Download and parse the existing summary.json so its entries can be merged.

    Returns an empty list when there is no existing summary or when the
    existing payload cannot be parsed. Failures are non-fatal so a corrupted
    legacy summary never blocks a fresh upload.
    """
    if existing_file_id is None:
        return []
    try:
        payload = await download_file(existing_file_id)
        existing = SummaryData.model_validate(json.loads(payload))
    except Exception as exc:
        activity.logger.warning(
            f"Could not read existing summary.json ({existing_file_id}); "
            f"proceeding without merge: {exc}"
        )
        return []
    return list(existing.processed_files)


async def _active_documents(project_id: UUID) -> dict[UUID, str]:
    """Map ``file_id -> filename`` for all active DOCUMENT files at current project_version.

    Used to reconcile the summary against the actual document state. The
    file_id is stable across renames, so this map is the canonical identity
    source: an entry survives reconcile iff its source_file_id is still in
    this map; its document_path/name is refreshed from the current filename.
    """
    files = await _list_all_files(project_id, "document")
    return {f.id: f.filename for f in files}


def _build_summary_data(
    processed_files: list[ProcessedFileInfo],
    base_metadata: BaseMetadata | None,
    total_duration_seconds: float,
) -> SummaryData:
    """Create a summary payload for the current project_version."""
    return SummaryData(
        base_metadata=base_metadata,
        total_duration_seconds=total_duration_seconds,
        processed_files=processed_files,
    )


@activity.defn(name="create_summary_from_results")
async def _create_summary_from_results(
    input: CreateSummaryFromResultsInput,
) -> SummaryResult:
    """
    Compiles a summary.json for the current project_version and uploads it to DMS.

    The summary is built by merging the freshly processed documents with the
    entries from the existing summary.json and then reconciling the result
    against the active ``DOCUMENT`` files at the current project_version.
    Merge & reconcile are keyed by ``source_file_id`` (the stable DMS file_id
    of the source document), so document renames are handled transparently:
    the entry survives, and its ``document_path``/``document_name`` are
    refreshed to the current filename.

    Invariant after this activity:
        ``summary.processed_files`` ⟺ active DOCUMENT files at current project_version.

    Returns:
        SummaryResult with file_id of the summary JSON
    """
    new_processed_files: list[ProcessedFileInfo] = [
        ProcessedFileInfo(
            document_name=result.document_name,
            document_path=result.document_path,
            processed_json_file_id=str(result.final_json_file_id),
            source_file_id=UUID(result.file_id) if result.file_id else None,
            processed_document=result.processed_document,
        )
        for result in input.results
    ]

    existing_file_id = await _find_existing_summary_id(input.project_id)
    existing_entries = await _load_existing_summary_entries(existing_file_id)

    active_id_to_path = await _active_documents(input.project_id)

    # Merge: existing first, then overlay new entries so the latest run wins
    # for the same source_file_id.
    by_file_id: dict[UUID, ProcessedFileInfo] = {
        entry.source_file_id: entry for entry in existing_entries if entry.source_file_id is not None
    }
    for entry in new_processed_files:
        if entry.source_file_id is not None:
            by_file_id[entry.source_file_id] = entry

    # Reconcile against active DOCUMENT files at the current project_version.
    # Entries survive iff their source_file_id is still active. Display fields
    # (document_path/document_name) are refreshed so renames propagate.
    reconciled: list[ProcessedFileInfo] = []
    dropped_ids: list[UUID] = []
    for file_id, entry in by_file_id.items():
        current_filename = active_id_to_path.get(file_id)
        if current_filename is None:
            dropped_ids.append(file_id)
            continue
        reconciled.append(
            entry.model_copy(
                update={
                    "document_path": current_filename,
                    "document_name": current_filename,
                }
            )
        )

    if dropped_ids:
        activity.logger.info(
            f"Reconciled summary: dropped {len(dropped_ids)} entries no longer "
            f"in DMS at current project_version: {sorted(str(i) for i in dropped_ids)}"
        )

    summary_data = _build_summary_data(
        reconciled,
        input.base_metadata,
        input.total_duration_seconds,
    )

    # Exclude processed_document from serialization (too large for summary.json).
    # The field is still available in the in-memory summary_data returned to callers.
    summary_json_str = summary_data.model_dump_json(
        indent=2,
        exclude={"processed_files": {"__all__": {"processed_document"}}},
    )
    summary_file_bytes = summary_json_str.encode("utf-8")

    # Upload new summary to DMS first, then delete old one.
    # If the upload fails, consumers still have the previous summary row.
    file_obj = await upload_file(
        DmsUploadInput(
            data=summary_file_bytes,
            filename=SUMMARY_FILENAME,
            project_id=input.project_id,
            file_type="content_extraction",
            content_type="application/json",
        )
    )

    # Delete old summary.json after successful upload.
    if existing_file_id:
        try:
            await delete_file(existing_file_id)
            activity.logger.info(f"Deleted old summary.json: {existing_file_id}")
        except Exception as e:
            activity.logger.warning(f"Failed to delete old summary.json: {e}")

    return SummaryResult(
        summary_file_id=str(file_obj.id),
        filename=SUMMARY_FILENAME,
        summary_data=summary_data,
    )


async def create_summary_from_results(
    input: CreateSummaryFromResultsInput,
) -> SummaryResult:
    """Workflow wrapper for DMS create_summary_from_results."""
    return await workflow.execute_activity(
        _create_summary_from_results,
        input,
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
