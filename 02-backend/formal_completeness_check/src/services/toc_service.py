"""Service layer for table of content notes CRUD operations."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from audit_client import ChangeType, record_audit_entry
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, retry_if_exception_type, stop_after_attempt

from src.config.settings import settings
from src.exceptions.exceptions import NotFoundError
from src.models.db_models import TableOfContentNotes
from src.models.db_models import TocJobStatus as TocJobStatusModel
from src.models.schemas.fcs_types import FileDownloadResponse
from src.models.schemas.toc_schemas import (
    CreateTableContentNoteRequest,
    TableContentNotesResponse,
    TocJobDoneResponse,
    TocJobStatus,
    TocMatchedDocumentType,
    TocNotesWithStatusResponse,
    TocResults,
)
from src.services.fcs_service import _get_latest_project_version, _validate_project_write_version
from src.services.job_service import verify_file_project_binding
from src.utils.logger import logger


async def _get_latest_toc_project_version(project_id: UUID, db: AsyncSession) -> int:
    return await _get_latest_project_version(project_id)


async def get_toc_notes_for_project(
    project_id: UUID,
    db: AsyncSession,
) -> TocNotesWithStatusResponse:
    """Return all table of content notes and the job status for a project."""
    project_version = await _get_latest_toc_project_version(project_id, db)
    notes_stmt = (
        select(TableOfContentNotes)
        .where(
            TableOfContentNotes.project_id == project_id,
            TableOfContentNotes.project_version == project_version,
            TableOfContentNotes.is_deleted.is_(False),
        )
        .order_by(TableOfContentNotes.created_at.desc())
    )
    notes_result = await db.execute(notes_stmt)
    notes = [TableContentNotesResponse.model_validate(n) for n in notes_result.scalars().all()]

    status_stmt = select(TocJobStatusModel).where(
        TocJobStatusModel.project_id == project_id,
        TocJobStatusModel.project_version == project_version,
        TocJobStatusModel.is_deleted.is_(False),
    )
    status_result = await db.execute(status_stmt)
    job_status = status_result.scalar_one_or_none()

    status_enum = None
    if job_status and job_status.status:
        try:
            status_enum = TocJobStatus(job_status.status)
        except ValueError:
            logger.error(
                EventAction.VALIDATE,
                EventOutcome.FAILURE,
                EventCategory.DATABASE,
                default_event=LogEventDefault.VALIDATION_FAILURE,
                message=f"Unknown TocJobStatus value {job_status.status} for project {project_id}",
            )

    return TocNotesWithStatusResponse(
        status=status_enum,
        notes=notes,
    )


async def create_toc_notes(
    project_id: UUID,
    payloads: list[CreateTableContentNoteRequest],
    db: AsyncSession,
) -> list[TableContentNotesResponse]:
    """Create multiple table of content notes for a project in a single transaction."""
    logger.info(
        EventAction.WRITE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Creating {len(payloads)} TOC notes for project_id={project_id}",
    )

    project_version = await _get_latest_toc_project_version(project_id, db)
    await _validate_project_write_version(project_id, project_version)
    notes = [
        TableOfContentNotes(project_id=project_id, project_version=project_version, content=payload.content)
        for payload in payloads
    ]
    db.add_all(notes)
    await db.flush()
    await db.commit()

    logger.info(
        EventAction.WRITE,
        EventOutcome.SUCCESS,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Successfully created {len(notes)} TOC notes for project_id={project_id}",
    )

    return [TableContentNotesResponse.model_validate(note) for note in notes]


async def update_toc_note_resolved_status(
    project_id: UUID,
    note_id: UUID,
    is_resolved: bool,
    db: AsyncSession,
    audit_context: dict[str, Any] | None = None,
) -> TableContentNotesResponse:
    """Update the resolved status of a table of content note."""
    logger.info(
        EventAction.CHANGE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Updating TOC note id={note_id} for project_id={project_id}",
    )

    project_version = await _get_latest_toc_project_version(project_id, db)
    await _validate_project_write_version(project_id, project_version)
    stmt = select(TableOfContentNotes).where(
        TableOfContentNotes.id == note_id,
        TableOfContentNotes.project_id == project_id,
        TableOfContentNotes.project_version == project_version,
        TableOfContentNotes.is_deleted.is_(False),
    )
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if note is None:
        raise NotFoundError(f"TOC note with id={note_id} not found for project_id={project_id}")

    note.is_resolved = is_resolved
    await record_audit_entry(
        db,
        project_id=project_id,
        entity_type="table_of_content_notes",
        change_type=ChangeType.UPDATE,
        entity_id=note_id,
        **(audit_context or {}),
    )
    await db.commit()

    logger.info(
        EventAction.CHANGE,
        EventOutcome.SUCCESS,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Successfully updated TOC note id={note_id} for project_id={project_id}",
    )

    return TableContentNotesResponse.model_validate(note)


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_toc_results(file_id: UUID, project_version: int | None = None) -> TocResults:
    """Fetch TOC results from DMS using a single HTTP client for both requests."""
    # Internal route: signed against the internal storage endpoint so this server-side caller can
    # reach it (the public route signs the browser-facing host, unreachable from the backend).
    download_url_endpoint = f"{settings.DOCUMENT_MANAGEMENT_SERVICE_URL}/v2/internal/files/{file_id}/generate-download-url"
    params = {"project_version": project_version} if project_version is not None else None

    logger.info(
        EventAction.READ,
        EventOutcome.UNKNOWN,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Fetching TOC results download URL for file_id={file_id}",
    )

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(download_url_endpoint, params=params)
        response.raise_for_status()
        download_info = FileDownloadResponse.model_validate(response.json())

        logger.debug(
            EventAction.READ,
            EventOutcome.SUCCESS,
            EventCategory.API,
            default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
            message=f"Obtained presigned download URL for file_id={file_id}",
        )

        response = await client.get(
            download_info.download_url,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        return TocResults.model_validate_json(response.content)


async def _overwrite_toc_notes(
    project_id: UUID,
    project_version: int,
    matched_types: list[TocMatchedDocumentType],
    db: AsyncSession,
) -> list[str]:
    """Process fetched results and overwrites matched document types as TOC notes.

    Returns the list of unmatched document type names that were saved as notes.
    """
    logger.info(
        EventAction.READ,
        EventOutcome.SUCCESS,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Fetched {len(matched_types)} matched document types for project_id={project_id}",
    )
    await db.execute(
        delete(TableOfContentNotes).where(
            TableOfContentNotes.project_id == project_id,
            TableOfContentNotes.project_version == project_version,
        )
    )
    unmatched = [mt for mt in matched_types if not mt.assigned_documents]
    notes = [
        TableOfContentNotes(
            project_id=project_id,
            project_version=project_version,
            content=mt.required_document_type.document_type_name,
        )
        for mt in unmatched
    ]

    try:
        db.add_all(notes)
        await db.flush()
    except Exception as e:
        logger.error(
            EventAction.WRITE,
            EventOutcome.FAILURE,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Failed to save TOC notes for project_id={project_id}: {e!s}",
        )
        raise

    logger.info(
        EventAction.WRITE,
        EventOutcome.SUCCESS,
        EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Created {len(notes)} TOC notes for project_id={project_id}",
    )

    return [mt.required_document_type.document_type_name for mt in unmatched]


async def _upsert_toc_job_status(
    project_id: UUID,
    project_version: int,
    status: TocJobStatus,
    db: AsyncSession,
) -> None:
    """Upsert the TOC job status for a project atomically"""
    stmt = (
        pg_insert(TocJobStatusModel)
        .values(
            project_id=project_id,
            project_version=project_version,
            status=status.value,
        )
        .on_conflict_do_update(
            index_elements=["project_id", "project_version"],
            index_where=(TocJobStatusModel.is_deleted.is_(False)),
            set_={
                "status": status.value,
                "updated_at": datetime.now(UTC),
            },
        )
    )
    await db.execute(stmt)
    await db.flush()


async def process_toc_job_results(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession,
    project_version: int | None = None,
) -> TocJobDoneResponse:
    """Fetch toc notes results from DMS and append matched document type names as notes."""
    project_version = await verify_file_project_binding(file_id, project_id, project_version)
    results = await _fetch_toc_results(file_id, project_version)

    if results.inhaltsverzeichnis_extraction_output.status == TocJobStatus.NO_INHALTSVERZEICHNIS_FOUND:
        await _upsert_toc_job_status(
            project_id,
            project_version,
            TocJobStatus.NO_INHALTSVERZEICHNIS_FOUND,
            db,
        )
        await db.commit()
        return TocJobDoneResponse(
            status=TocJobStatus.NO_INHALTSVERZEICHNIS_FOUND,
            notes_created=0,
            matched_document_types_total=0,
            unmatched_document_types=[],
            toc_document_id=None,
        )

    matched_types = results.inhaltsverzeichnis_matching_output.matched_document_types
    unmatched_names = await _overwrite_toc_notes(project_id, project_version, matched_types, db)
    status = TocJobStatus.SUCCESS
    toc_document_id = None
    if results.inhaltsverzeichnis_extraction_output.metadata:
        toc_document_id = results.inhaltsverzeichnis_extraction_output.metadata.get("document_id")

    await _upsert_toc_job_status(project_id, project_version, status, db)
    await db.commit()

    return TocJobDoneResponse(
        status=status,
        notes_created=len(unmatched_names),
        matched_document_types_total=len(matched_types),
        unmatched_document_types=unmatched_names,
        toc_document_id=toc_document_id,
    )
