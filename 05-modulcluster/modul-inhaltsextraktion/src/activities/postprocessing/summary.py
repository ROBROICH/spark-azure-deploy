"""Summary creation activity."""

import json
from datetime import timedelta
from uuid import UUID

from pydantic import ValidationError
from temporal.contracts import BaseMetadata, ProcessedFileInfo, SummaryData
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.postprocessing.schemas import (
    CreateSummaryFromResultsInput,
    SummaryResult,
)
from src.config import get_config
from src.utils.dms_utils import download_file, list_all_files
from src.utils.summary_file import (
    SUMMARY_FILENAME,
    list_summary_files,
    replace_summary_file,
    serialize_summary,
)

__all__ = [
    "_create_summary_from_results",
    "create_summary_from_results",
]


async def _load_existing_summary_entries(
    existing_file_id: UUID | None,
) -> list[ProcessedFileInfo]:
    """Download and parse the existing summary.json so its entries can be merged.

    Returns an empty list when there is no existing summary, when its file is
    missing from storage, or when the existing payload cannot be parsed or
    validated, so a corrupted legacy summary never blocks a fresh upload.
    Other download errors propagate so the Temporal retry policy applies
    instead of silently dropping all entries of earlier runs.
    """
    if existing_file_id is None:
        return []
    try:
        payload = await download_file(existing_file_id)
    except FileNotFoundError:
        activity.logger.warning(
            f"Existing summary.json ({existing_file_id}) not found in storage; proceeding without merge"
        )
        return []
    try:
        existing = SummaryData.model_validate(json.loads(payload))
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError):
        activity.logger.exception(
            f"Could not parse existing summary.json ({existing_file_id}); proceeding without merge"
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
    files = await list_all_files(project_id, "document")
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

    existing_summary_files = await list_summary_files(input.project_id)
    existing_file_id = existing_summary_files[0].id if existing_summary_files else None
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

    file_obj = await replace_summary_file(
        input.project_id,
        serialize_summary(summary_data),
        existing_summary_files,
    )

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
