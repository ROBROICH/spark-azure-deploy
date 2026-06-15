"""Integration tests for TOC Notes API endpoints."""

import uuid
from collections.abc import Iterator
from http import HTTPStatus
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.models.db_models import TableOfContentNotes, TocJobStatus


@pytest.fixture(autouse=True)
def _mock_project_services(monkeypatch: pytest.MonkeyPatch) -> Iterator[AsyncMock]:
    async def latest(project_id: uuid.UUID) -> int:
        return 1

    async def validate(project_id: uuid.UUID, project_version: int) -> int:
        return project_version

    monkeypatch.setattr("src.services.toc_service._get_latest_project_version", latest)
    monkeypatch.setattr("src.services.toc_service._validate_project_write_version", validate)
    with patch("src.services.toc_service.verify_file_project_binding", new=AsyncMock(return_value=1)) as mock:
        yield mock


@pytest.mark.asyncio
async def test_get_toc_notes_empty_project(client: AsyncClient) -> None:
    """Verifies API returns empty notes list and null status for project with no data."""
    project_id = uuid.uuid4()

    response = await client.get(f"/{project_id}/toc-notes")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data == {"status": None, "notes": []}


@pytest.mark.asyncio
async def test_get_toc_notes_with_multiple_notes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies notes are returned in correct order (newest first) with null status."""
    project_id = uuid.uuid4()

    async with session_factory() as session:
        # Create 3 notes
        note1 = TableOfContentNotes(
            project_id=project_id,
            content="First note",
            is_resolved=False,
        )
        note2 = TableOfContentNotes(
            project_id=project_id,
            content="Second note",
            is_resolved=True,
        )
        note3 = TableOfContentNotes(
            project_id=project_id,
            content="Third note",
            is_resolved=False,
        )
        session.add_all([note1, note2, note3])
        await session.commit()

    response = await client.get(f"/{project_id}/toc-notes")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert "status" in data
    assert "notes" in data
    assert data["status"] is None
    assert len(data["notes"]) == 3

    # Verify structure of first note
    assert "id" in data["notes"][0]
    assert "project_id" in data["notes"][0]
    assert "content" in data["notes"][0]
    assert "is_resolved" in data["notes"][0]
    assert "created_at" in data["notes"][0]
    assert "updated_at" in data["notes"][0]

    # Verify ordering (newest first - note3, note2, note1)
    contents = [note["content"] for note in data["notes"]]
    assert "Third note" in contents
    assert "Second note" in contents
    assert "First note" in contents


@pytest.mark.asyncio
async def test_get_toc_notes_returns_persisted_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies GET returns the persisted job status alongside notes."""
    project_id = uuid.uuid4()

    async with session_factory() as session:
        session.add(TocJobStatus(project_id=project_id, status="no_inhaltsverzeichnis_found"))
        await session.commit()

    response = await client.get(f"/{project_id}/toc-notes")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == "no_inhaltsverzeichnis_found"
    assert data["notes"] == []


@pytest.mark.asyncio
async def test_get_toc_notes_with_status_and_notes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies GET returns both status and notes when both exist."""
    project_id = uuid.uuid4()

    async with session_factory() as session:
        session.add(TocJobStatus(project_id=project_id, status="success"))
        session.add(TableOfContentNotes(project_id=project_id, content="Missing doc A", is_resolved=False))
        await session.commit()

    response = await client.get(f"/{project_id}/toc-notes")

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == "success"
    assert len(data["notes"]) == 1
    assert data["notes"][0]["content"] == "Missing doc A"


@pytest.mark.asyncio
async def test_create_toc_note(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies single note creation via API (list with one item)."""
    project_id = uuid.uuid4()

    response = await client.post(
        f"/{project_id}/toc-notes",
        json=[{"content": "Test note content"}],
    )

    assert response.status_code == HTTPStatus.CREATED
    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 1
    assert "id" in data[0]
    assert data[0]["project_id"] == str(project_id)
    assert data[0]["content"] == "Test note content"
    assert data[0]["is_resolved"] is False
    assert "created_at" in data[0]
    assert "updated_at" in data[0]

    # Verify note was persisted in database
    async with session_factory() as session:
        stmt = select(TableOfContentNotes).where(TableOfContentNotes.project_id == project_id)
        result = await session.execute(stmt)
        notes = result.scalars().all()
        assert len(notes) == 1
        assert notes[0].content == "Test note content"
        assert notes[0].is_resolved is False


@pytest.mark.asyncio
async def test_create_multiple_toc_notes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies creating multiple notes in a single request."""
    project_id = uuid.uuid4()

    response = await client.post(
        f"/{project_id}/toc-notes",
        json=[
            {"content": "First note"},
            {"content": "Second note"},
            {"content": "Third note"},
        ],
    )

    assert response.status_code == HTTPStatus.CREATED
    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 3
    contents = {item["content"] for item in data}
    assert contents == {"First note", "Second note", "Third note"}

    for item in data:
        assert item["project_id"] == str(project_id)
        assert item["is_resolved"] is False

    # Verify all notes persisted
    async with session_factory() as session:
        stmt = select(TableOfContentNotes).where(TableOfContentNotes.project_id == project_id)
        result = await session.execute(stmt)
        notes = result.scalars().all()
        assert len(notes) == 3


@pytest.mark.asyncio
async def test_update_toc_note_resolved_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies updating resolved status via API."""
    project_id = uuid.uuid4()

    # Create a note
    async with session_factory() as session:
        note = TableOfContentNotes(
            project_id=project_id,
            content="Note to be resolved",
            is_resolved=False,
        )
        session.add(note)
        await session.commit()
        note_id = note.id

    # Update the resolved status
    response = await client.patch(
        f"/{project_id}/toc-notes/{note_id}",
        json={"is_resolved": True},
    )

    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["id"] == str(note_id)
    assert data["is_resolved"] is True

    # Verify in database
    async with session_factory() as session:
        stmt = select(TableOfContentNotes).where(TableOfContentNotes.id == note_id)
        result = await session.execute(stmt)
        updated_note = result.scalar_one()
        assert updated_note.is_resolved is True


@pytest.mark.asyncio
async def test_update_toc_note_not_found(client: AsyncClient) -> None:
    """Verifies 404 error for non-existent note."""
    project_id = uuid.uuid4()
    non_existent_note_id = uuid.uuid4()

    response = await client.patch(
        f"/toc-notes/{project_id}/update-resolved/{non_existent_note_id}",
        json={"is_resolved": True},
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_toc_note_wrong_project(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Verifies project isolation - note from project A cannot be accessed via project B."""
    project_a = uuid.uuid4()
    project_b = uuid.uuid4()

    # Create note for project A
    async with session_factory() as session:
        note = TableOfContentNotes(
            project_id=project_a,
            content="Note from project A",
            is_resolved=False,
        )
        session.add(note)
        await session.commit()
        note_id = note.id

    # Try to update via project B (should fail)
    response = await client.patch(
        f"/toc-notes/{project_b}/update-resolved/{note_id}",
        json={"is_resolved": True},
    )

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert "not found" in response.json()["detail"].lower()

    # Verify original note is unchanged in database
    async with session_factory() as session:
        stmt = select(TableOfContentNotes).where(TableOfContentNotes.id == note_id)
        result = await session.execute(stmt)
        note = result.scalar_one()
        assert note.is_resolved is False  # Should still be False
