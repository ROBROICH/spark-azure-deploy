"""Business logic for plausibility note management."""

from typing import Any, cast
from uuid import UUID

import httpx
from authentification.internal_api_key import internal_api_key_headers
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from node_crud.exceptions import ProjectVersionLockedError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from tenacity import retry, retry_if_exception_type, stop_after_attempt

from src.config.settings import settings
from src.exceptions.exceptions import NotFoundError
from src.models.db_models import PlausibilityNote, PlausibilityNoteOccurrence
from src.models.schemas.plausibility_notes import (
    Contradiction,
    ContradictionOccurrence,
    FileDownloadResponse,
    JobDoneResponse,
    PlausibilityCheckResult,
    PlausibilityNoteStatus,
)
from src.utils.logger import logger


def _latest_version_from_response(body: dict[str, Any]) -> int:
    latest_version = body.get("latest_version", body.get("latestVersion"))
    if latest_version is None:
        raise KeyError("latest_version")
    return int(latest_version)


async def _get_latest_project_version(project_id: UUID) -> int:
    url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/latest-version"
    async with httpx.AsyncClient(timeout=10.0, headers=internal_api_key_headers()) as client:
        response = await client.get(url)
        if response.status_code == 404:
            raise NotFoundError(f"Project {project_id} not found in PLS")
        response.raise_for_status()
    return _latest_version_from_response(response.json())


async def _validate_project_write_version(project_id: UUID, project_version: int) -> int:
    url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/version-lock/validate-write"
    async with httpx.AsyncClient(timeout=10.0, headers=internal_api_key_headers()) as client:
        response = await client.post(url, json={"project_version": project_version})
        if response.status_code == 409:
            detail = response.json().get("detail", response.text)
            raise ProjectVersionLockedError(str(project_id), detail)
        response.raise_for_status()
    return _latest_version_from_response(response.json())


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_file_metadata(file_id: UUID, project_version: int | None = None) -> dict[str, Any]:
    """Fetch file metadata from Document Management Service."""
    base_url = settings.DOCUMENT_MANAGEMENT_SERVICE_URL.rstrip("/")
    metadata_endpoint = f"{base_url}/v2/files/{file_id}"
    params = {"project_version": project_version} if project_version is not None else None
    async with httpx.AsyncClient(timeout=30.0, headers=internal_api_key_headers()) as client:
        response = await client.get(metadata_endpoint, params=params)
        response.raise_for_status()
        return response.json()


async def verify_file_project_binding(file_id: UUID, project_id: UUID, project_version: int | None = None) -> int:
    """Verify that the file belongs to the project without leaking cross-project existence."""
    try:
        metadata = await _fetch_file_metadata(file_id, project_version)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise NotFoundError(f"File '{file_id}' not found.") from e
        raise

    file_project_id = metadata["projectId"]
    if file_project_id is None or str(file_project_id) != str(project_id):
        logger.warn(
            EventAction.VALIDATE,
            EventOutcome.FAILURE,
            EventCategory.API,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"File '{file_id}' does not belong to project '{project_id}'",
        )
        raise NotFoundError("File not found in project.")
    return int(metadata["projectVersion"])


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_download_url(
    download_url_endpoint: str,
    project_version: int | None = None,
) -> FileDownloadResponse:
    """Fetch presigned download URL for a file from Document Management Service."""
    params = {"project_version": project_version} if project_version is not None else None
    async with httpx.AsyncClient(timeout=30.0, headers=internal_api_key_headers()) as client:
        response = await client.get(download_url_endpoint, params=params)
        response.raise_for_status()
        return FileDownloadResponse.model_validate(response.json())


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_json_content(
    download_url: str,
) -> PlausibilityCheckResult:
    """Fetch and parse JSON content from presigned URL."""
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={
            "Content-Type": "application/json",
        },
    ) as gcs_client:
        response = await gcs_client.get(download_url)
        response.raise_for_status()
        return PlausibilityCheckResult.model_validate_json(response.content)


async def fetch_results_file(file_id: UUID, project_version: int | None = None) -> PlausibilityCheckResult:
    """Fetch and parse the results JSON from Document Management Service."""
    base_url = settings.DOCUMENT_MANAGEMENT_SERVICE_URL.rstrip("/")
    download_url_endpoint = f"{base_url}/v2/files/{file_id}/generate-download-url"

    logger.debug(
        EventAction.READ,
        EventOutcome.UNKNOWN,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Fetching results file from document management service via download URL from {download_url_endpoint}",
    )

    download_info = await _fetch_download_url(download_url_endpoint, project_version)
    logger.debug(
        EventAction.READ,
        EventOutcome.SUCCESS,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Obtained presigned download URL for file_id={file_id}",
    )

    return await _fetch_json_content(download_info.download_url)


async def delete_all_for_project(project_id: UUID, db: AsyncSession, *, project_version: int = 1) -> int:
    """Delete all plausibility notes for a project."""
    logger.info(
        EventAction.DELETE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Deleting all plausibility notes for project_id={project_id}",
    )

    # Cascading delete should handle occurrences
    result = await db.execute(
        delete(PlausibilityNote).where(
            PlausibilityNote.project_id == project_id,
            PlausibilityNote.project_version == project_version,
        )
    )
    deleted_count = cast(Any, result).rowcount

    logger.info(
        EventAction.DELETE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Deleted {deleted_count} plausibility notes for project_id={project_id} (pending commit)",
    )
    return deleted_count


async def bulk_insert_results(
    project_id: UUID,
    results: PlausibilityCheckResult,
    db: AsyncSession,
    *,
    project_version: int = 1,
) -> None:
    """Insert plausibility notes and occurrences from job results."""
    notes_count = 0
    for contradiction in results.contradictions:
        note = PlausibilityNote()
        note.id = contradiction.id
        note.project_id = project_id
        note.project_version = project_version
        note.title = contradiction.title
        note.description = contradiction.description
        note.rating = contradiction.rating
        note.status = contradiction.status.value
        db.add(note)
        notes_count += 1

        for occ in contradiction.occurrences:
            occurrence = PlausibilityNoteOccurrence()
            occurrence.project_id = project_id
            occurrence.project_version = project_version
            occurrence.plausibility_note_id = note.id
            occurrence.document_id = occ.document_id
            occurrence.document_name = occ.document_name
            occurrence.content_excerpt = occ.content_excerpt
            occurrence.page_number = occ.page_number
            db.add(occurrence)

    await db.flush()

    logger.info(
        EventAction.WRITE,
        EventOutcome.SUCCESS,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Inserted {notes_count} plausibility notes for project {project_id}",
    )


async def process_job_results(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession,
    project_version: int | None = None,
) -> JobDoneResponse:
    """Process job results: fetch, delete old data, insert new data."""
    logger.info(
        EventAction.WRITE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.GENERAL,
        message=f"Processing job results for project_id={project_id}, file_id={file_id}",
    )
    project_version = await verify_file_project_binding(file_id, project_id, project_version)
    results = await fetch_results_file(file_id, project_version)

    if not results.contradictions:
        logger.warn(
            EventAction.VALIDATE,
            EventOutcome.UNKNOWN,
            EventCategory.DATABASE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"Results contain no contradictions for project_id={project_id}",
        )

    contradictions_count = len(results.contradictions)
    total_occurrences = sum(len(c.occurrences) for c in results.contradictions)

    try:
        deleted_count = await delete_all_for_project(project_id, db, project_version=project_version)
        logger.info(
            EventAction.WRITE,
            EventOutcome.UNKNOWN,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Inserting new plausibility notes for project_id={project_id}",
        )
        await bulk_insert_results(project_id, results, db, project_version=project_version)
        await db.commit()
        logger.info(
            EventAction.WRITE,
            EventOutcome.SUCCESS,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_COMMIT,
            message=f"Successfully processed job results for project_id={project_id}",
        )

        return JobDoneResponse(
            status="no_contradictions" if not contradictions_count else "contradictions_found",
            contradictions_found=contradictions_count,
            total_occurrences=total_occurrences,
            previous_records_deleted=deleted_count,
        )

    except Exception as e:
        logger.error(
            EventAction.WRITE,
            EventOutcome.FAILURE,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_ERROR,
            message=f"Failed to process job results for project_id={project_id}: {e!s}",
        )
        await db.rollback()
        raise


async def update_note_status(
    note_id: UUID,
    status: PlausibilityNoteStatus,
    db: AsyncSession,
) -> PlausibilityNote | None:
    """Update the status of a plausibility note."""
    note = await _get_active_note(note_id, db)
    if note is None:
        return None

    await _validate_project_write_version(note.project_id, note.project_version)
    note.status = status.value
    await db.commit()
    return note


async def delete_note(
    note_id: UUID,
    db: AsyncSession,
) -> bool:
    """Delete a single plausibility note by ID."""
    note = await _get_active_note(note_id, db)
    if note is None:
        return False
    await _validate_project_write_version(note.project_id, note.project_version)

    result = await db.execute(
        delete(PlausibilityNote).where(
            PlausibilityNote.id == note_id,
            PlausibilityNote.project_version == note.project_version,
            PlausibilityNote.is_deleted.is_(False),
        )
    )
    await db.commit()
    return cast(Any, result).rowcount > 0


async def get_plausibility_notes(
    project_id: UUID,
    db: AsyncSession,
) -> PlausibilityCheckResult:
    """Return all plausibility notes for a project."""
    latest_version = await _get_latest_project_version(project_id)

    created_at = cast(Any, PlausibilityNote).created_at
    stmt = (
        select(PlausibilityNote)
        .where(
            PlausibilityNote.project_id == project_id,
            PlausibilityNote.project_version == latest_version,
            PlausibilityNote.is_deleted.is_(False),
        )
        .options(selectinload(PlausibilityNote.occurrences))
        .order_by(created_at.asc())
    )
    result = await db.execute(stmt)
    notes = result.scalars().all()

    contradictions = []
    for note in notes:
        occurrences = [
            ContradictionOccurrence(
                document_id=occ.document_id,
                document_name=occ.document_name,
                content_excerpt=occ.content_excerpt,
                page_number=occ.page_number,
            )
            for occ in note.occurrences
        ]

        contradictions.append(
            Contradiction(
                id=note.id,
                title=note.title,
                description=note.description,
                rating=note.rating,
                status=PlausibilityNoteStatus(note.status),
                occurrences=occurrences,
            )
        )

    return PlausibilityCheckResult(contradictions=contradictions)


async def get_note(
    note_id: UUID,
    db: AsyncSession,
) -> PlausibilityNote:
    note = await _get_active_note(note_id, db)
    if note is None:
        raise NotFoundError(f"Note {note_id} not found")
    return note


async def _get_active_note(
    note_id: UUID,
    db: AsyncSession,
) -> PlausibilityNote | None:
    project_id = await db.scalar(
        select(PlausibilityNote.project_id)
        .where(PlausibilityNote.id == note_id)
        .order_by(PlausibilityNote.project_version.desc())
        .limit(1)
    )
    if project_id is None:
        return None

    project_version = await _get_latest_project_version(project_id)
    result = await db.execute(
        select(PlausibilityNote).where(
            PlausibilityNote.id == note_id,
            PlausibilityNote.project_version == project_version,
            PlausibilityNote.is_deleted.is_(False),
        )
    )
    return result.scalar_one_or_none()
