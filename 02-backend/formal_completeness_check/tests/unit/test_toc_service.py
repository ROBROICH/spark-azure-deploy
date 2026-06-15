"""Unit tests for TOC Notes service layer."""

import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from audit_client import ChangeType
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions.exceptions import NotFoundError
from src.models.db_models import TableOfContentNotes, TocJobStatus
from src.models.schemas.toc_schemas import (
    TocExtractionOutput,
    TocMatchedDocumentType,
    TocMatchingOutput,
    TocRequiredDocumentType,
    TocResults,
)
from src.services.toc_service import (
    get_toc_notes_for_project,
    process_toc_job_results,
    update_toc_note_resolved_status,
)


@pytest.fixture(autouse=True)
def _mock_file_project_binding() -> Iterator[AsyncMock]:
    with patch("src.services.toc_service.verify_file_project_binding", new=AsyncMock()) as mock:
        mock.return_value = 1
        yield mock


@pytest.fixture(autouse=True)
def project_versions(monkeypatch: pytest.MonkeyPatch) -> dict[uuid.UUID, int]:
    versions: dict[uuid.UUID, int] = {}

    async def latest(project_id: uuid.UUID) -> int:
        return versions.get(project_id, 1)

    async def validate(project_id: uuid.UUID, project_version: int) -> int:
        return project_version

    monkeypatch.setattr("src.services.toc_service._get_latest_project_version", latest)
    monkeypatch.setattr("src.services.toc_service._validate_project_write_version", validate)
    return versions


@pytest.fixture(autouse=True)
def mock_record_audit_entry(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr("src.services.toc_service.record_audit_entry", mock)
    return mock


@pytest.mark.asyncio
async def test_update_toc_note_resolved_status_not_found(
    db_session: AsyncSession,
) -> None:
    """Verifies NotFoundError is raised for missing note."""
    project_id = uuid.uuid4()
    non_existent_note_id = uuid.uuid4()

    with pytest.raises(NotFoundError, match="not found"):
        await update_toc_note_resolved_status(project_id, non_existent_note_id, True, db_session)


@pytest.mark.asyncio
async def test_update_toc_note_resolved_status_wrong_project(
    db_session: AsyncSession,
) -> None:
    """Verifies project isolation at service layer."""
    project_a = uuid.uuid4()
    project_b = uuid.uuid4()

    # Create note for project A
    note = TableOfContentNotes(
        project_id=project_a,
        content="Note from project A",
        is_resolved=False,
    )
    db_session.add(note)
    await db_session.commit()
    note_id = note.id

    # Try to access via project B (should raise NotFoundError)
    with pytest.raises(NotFoundError, match="not found"):
        await update_toc_note_resolved_status(project_b, note_id, True, db_session)


@pytest.mark.asyncio
async def test_process_toc_job_results_no_inhaltsverzeichnis_found(
    db_session: AsyncSession,
) -> None:
    """When extraction status is no_inhaltsverzeichnis_found, persists status and creates no notes."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    toc_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="no_inhaltsverzeichnis_found"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(matched_document_types=[]),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=toc_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "no_inhaltsverzeichnis_found"
    assert response.notes_created == 0
    assert response.matched_document_types_total == 0

    # Status must be persisted
    stmt = sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id)
    rows = await db_session.execute(stmt)
    job_status = rows.scalar_one()
    assert job_status.status == "no_inhaltsverzeichnis_found"


@pytest.mark.asyncio
async def test_process_toc_job_results_missing_documents(
    db_session: AsyncSession,
) -> None:
    """When TOC found with unmatched types, persists success status."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    toc_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="success"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(
            matched_document_types=[
                TocMatchedDocumentType(
                    required_document_type=TocRequiredDocumentType(document_type_name="Lärmgutachten"),
                    assigned_documents=[],  # unmatched
                ),
            ]
        ),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=toc_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "success"
    assert response.notes_created == 1
    assert "Lärmgutachten" in response.unmatched_document_types

    stmt = sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id)
    rows = await db_session.execute(stmt)
    job_status = rows.scalar_one()
    assert job_status.status == "success"


@pytest.mark.asyncio
async def test_get_toc_notes_for_project_returns_status(
    db_session: AsyncSession,
) -> None:
    """get_toc_notes_for_project returns status from TocJobStatus and associated notes."""
    project_id = uuid.uuid4()

    db_session.add(TocJobStatus(project_id=project_id, status="no_inhaltsverzeichnis_found"))
    db_session.add(TableOfContentNotes(project_id=project_id, content="some note", is_resolved=False))
    await db_session.commit()

    result = await get_toc_notes_for_project(project_id, db_session)

    assert result.status == "no_inhaltsverzeichnis_found"
    assert len(result.notes) == 1
    assert result.notes[0].content == "some note"


@pytest.mark.asyncio
async def test_get_toc_notes_for_project_returns_latest_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    """get_toc_notes_for_project ignores historical TOC rows after version copy."""
    project_id = uuid.uuid4()
    project_versions[project_id] = 2

    db_session.add(TocJobStatus(project_id=project_id, project_version=1, status="no_inhaltsverzeichnis_found"))
    db_session.add(TableOfContentNotes(project_id=project_id, project_version=1, content="old note", is_resolved=False))
    db_session.add(TocJobStatus(project_id=project_id, project_version=2, status="success"))
    db_session.add(TableOfContentNotes(project_id=project_id, project_version=2, content="new note", is_resolved=False))
    await db_session.commit()

    result = await get_toc_notes_for_project(project_id, db_session)

    assert result.status == "success"
    assert [note.content for note in result.notes] == ["new note"]


@pytest.mark.asyncio
async def test_update_toc_note_resolved_status_updates_latest_version(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
) -> None:
    """update_toc_note_resolved_status leaves older copied rows unchanged."""
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    note_id = uuid.uuid4()

    old_note = TableOfContentNotes(
        id=note_id,
        project_id=project_id,
        project_version=1,
        content="old note",
        is_resolved=False,
    )
    latest_note = TableOfContentNotes(
        id=note_id,
        project_id=project_id,
        project_version=2,
        content="new note",
        is_resolved=False,
    )
    db_session.add_all(
        [
            TocJobStatus(project_id=project_id, project_version=2, status="success"),
            old_note,
            latest_note,
        ]
    )
    await db_session.commit()

    result = await update_toc_note_resolved_status(project_id, note_id, True, db_session)
    await db_session.refresh(old_note)
    await db_session.refresh(latest_note)

    assert result.is_resolved is True
    assert old_note.is_resolved is False
    assert latest_note.is_resolved is True


@pytest.mark.asyncio
async def test_process_toc_job_results_all_matched(
    db_session: AsyncSession,
) -> None:
    """When all document types are matched, persists success status and creates no notes."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    toc_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="success"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(
            matched_document_types=[
                TocMatchedDocumentType(
                    required_document_type=TocRequiredDocumentType(document_type_name="Lärmgutachten"),
                    assigned_documents=["some_doc.pdf"],  # matched
                ),
            ]
        ),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=toc_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "success"
    assert response.notes_created == 0
    assert response.unmatched_document_types == []

    stmt = sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id)
    rows = await db_session.execute(stmt)
    job_status = rows.scalar_one()
    assert job_status.status == "success"


@pytest.mark.asyncio
async def test_process_toc_job_results_no_document_types_found(
    db_session: AsyncSession,
) -> None:
    """When TOC found but no matched document types, persists success status."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    toc_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="success"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(matched_document_types=[]),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=toc_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "success"
    assert response.notes_created == 0
    assert response.matched_document_types_total == 0

    stmt = sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id)
    rows = await db_session.execute(stmt)
    job_status = rows.scalar_one()
    assert job_status.status == "success"


@pytest.mark.asyncio
async def test_process_toc_job_results_upsert_updates_existing_status(
    db_session: AsyncSession,
) -> None:
    """Calling process_toc_job_results twice for the same project updates the existing status row."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    first_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="no_inhaltsverzeichnis_found"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(matched_document_types=[]),
    )
    second_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="success"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(
            matched_document_types=[
                TocMatchedDocumentType(
                    required_document_type=TocRequiredDocumentType(document_type_name="Lärmgutachten"),
                    assigned_documents=[],
                ),
            ]
        ),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=first_results)):
        await process_toc_job_results(project_id, file_id, db_session)

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=second_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "success"

    stmt = sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id)
    rows = await db_session.execute(stmt)
    all_statuses = rows.scalars().all()
    assert len(all_statuses) == 1  # only one row, not two
    assert all_statuses[0].status == "success"


@pytest.mark.asyncio
async def test_process_toc_job_results_uses_file_project_version(
    db_session: AsyncSession,
    _mock_file_project_binding: AsyncMock,
) -> None:
    """TOC job results replace only the project version reported by DMS metadata."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()
    _mock_file_project_binding.return_value = 2
    db_session.add(TocJobStatus(project_id=project_id, project_version=1, status="success"))
    db_session.add(TableOfContentNotes(project_id=project_id, project_version=1, content="old note", is_resolved=False))
    await db_session.commit()

    toc_results = TocResults(
        inhaltsverzeichnis_extraction_output=TocExtractionOutput(status="success"),
        inhaltsverzeichnis_matching_output=TocMatchingOutput(
            matched_document_types=[
                TocMatchedDocumentType(
                    required_document_type=TocRequiredDocumentType(document_type_name="New missing type"),
                    assigned_documents=[],
                ),
            ]
        ),
    )

    with patch("src.services.toc_service._fetch_toc_results", new=AsyncMock(return_value=toc_results)):
        response = await process_toc_job_results(project_id, file_id, db_session)

    assert response.status == "success"
    notes_result = await db_session.execute(
        sa_select(TableOfContentNotes)
        .where(TableOfContentNotes.project_id == project_id)
        .order_by(TableOfContentNotes.project_version)
    )
    notes = notes_result.scalars().all()
    assert [(note.project_version, note.content) for note in notes] == [
        (1, "old note"),
        (2, "New missing type"),
    ]

    status_result = await db_session.execute(
        sa_select(TocJobStatus).where(TocJobStatus.project_id == project_id).order_by(TocJobStatus.project_version)
    )
    statuses = status_result.scalars().all()
    assert [(status.project_version, status.status) for status in statuses] == [(1, "success"), (2, "success")]


@pytest.mark.asyncio
async def test_get_toc_notes_for_project_no_status(
    db_session: AsyncSession,
) -> None:
    """get_toc_notes_for_project returns None status when job has not run yet."""
    project_id = uuid.uuid4()

    result = await get_toc_notes_for_project(project_id, db_session)

    assert result.status is None
    assert result.notes == []


@pytest.mark.asyncio
async def test_update_toc_note_resolved_status_audit_log(
    db_session: AsyncSession,
    project_versions: dict[uuid.UUID, int],
    mock_record_audit_entry: AsyncMock,
) -> None:
    project_id = uuid.uuid4()
    project_versions[project_id] = 1
    note_id = uuid.uuid4()

    note = TableOfContentNotes(
        id=note_id,
        project_id=project_id,
        project_version=1,
        content="some note",
        is_resolved=False,
    )
    db_session.add_all(
        [
            TocJobStatus(project_id=project_id, project_version=1, status="success"),
            note,
        ]
    )
    await db_session.commit()

    audit_ctx = {"actor_user_id": uuid.uuid4()}
    await update_toc_note_resolved_status(project_id, note_id, True, db_session, audit_context=audit_ctx)

    mock_record_audit_entry.assert_awaited_once_with(
        db_session,
        project_id=project_id,
        entity_type="table_of_content_notes",
        change_type=ChangeType.UPDATE,
        entity_id=note_id,
        actor_user_id=audit_ctx["actor_user_id"],
    )
