import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from src.models.db_models import PlausibilityNote
from src.models.schemas.plausibility_notes import (
    Contradiction,
    ContradictionOccurrence,
    PlausibilityCheckResult,
    PlausibilityNoteStatus,
)
from src.services.plausibility_notes_service import (
    bulk_insert_results,
    delete_all_for_project,
    delete_note,
    fetch_results_file,
    get_plausibility_notes,
    process_job_results,
    update_note_status,
)


@pytest.fixture(autouse=True)
def _mock_file_project_binding():
    with patch(
        "src.services.plausibility_notes_service.verify_file_project_binding", new=AsyncMock(return_value=1)
    ) as mock:
        yield mock


@pytest.fixture(autouse=True)
def project_versions(monkeypatch: pytest.MonkeyPatch) -> dict[uuid.UUID, int]:
    versions: dict[uuid.UUID, int] = {}

    async def latest(project_id: uuid.UUID) -> int:
        return versions.get(project_id, 1)

    async def validate(project_id: uuid.UUID, project_version: int) -> int:
        return project_version

    monkeypatch.setattr("src.services.plausibility_notes_service._get_latest_project_version", latest)
    monkeypatch.setattr("src.services.plausibility_notes_service._validate_project_write_version", validate)
    return versions


@pytest.fixture
def mock_results():
    return PlausibilityCheckResult(
        contradictions=[
            Contradiction(
                id=uuid.uuid4(),
                title="Title 1",
                description="Desc 1",
                rating=72,
                status=PlausibilityNoteStatus.OPEN,
                occurrences=[
                    ContradictionOccurrence(
                        documentId="doc1",
                        documentName="Doc 1",
                        contentExcerpt="Excerpt 1",
                        pageNumber=1,
                    )
                ],
            )
        ]
    )


@pytest.mark.asyncio
async def test_fetch_results_file():
    """Test fetching results file from external service."""
    file_id = uuid.uuid4()
    mock_download_response = {"download_url": "http://example.com/download"}

    # We construct the JSON content that the mocked download URL would return
    mock_content_obj = PlausibilityCheckResult(contradictions=[])

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        # Mock get response for download URL
        mock_resp_url = MagicMock()
        mock_resp_url.json.return_value = mock_download_response
        mock_resp_url.raise_for_status = MagicMock()

        # Mock get response for content
        mock_resp_content = MagicMock()
        # model_dump_json returns a string
        mock_resp_content.content = mock_content_obj.model_dump_json().encode("utf-8")
        mock_resp_content.raise_for_status = MagicMock()

        mock_client.get.side_effect = [mock_resp_url, mock_resp_content]

        result = await fetch_results_file(file_id)
        assert isinstance(result, PlausibilityCheckResult)
        assert len(result.contradictions) == 0


@pytest.mark.asyncio
async def test_delete_all_for_project(db_session):
    """Test deleting all notes for a project."""
    project_id = uuid.uuid4()
    # Create dummy data
    note = PlausibilityNote(
        id=uuid.uuid4(),
        project_id=project_id,
        title="Old title",
        description="test",
        status="OPEN",
    )
    db_session.add(note)
    await db_session.commit()

    # Verify it exists
    result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.project_id == project_id))
    assert len(result.scalars().all()) == 1

    await delete_all_for_project(project_id, db_session)

    result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.project_id == project_id))
    assert len(result.scalars().all()) == 0


@pytest.mark.asyncio
async def test_delete_all_for_project_keeps_other_versions(db_session, mock_results):
    project_id = uuid.uuid4()

    await bulk_insert_results(project_id, mock_results, db_session, project_version=1)
    await bulk_insert_results(project_id, mock_results, db_session, project_version=2)
    await db_session.commit()

    await delete_all_for_project(project_id, db_session, project_version=2)

    result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.project_id == project_id))
    notes = result.scalars().all()
    assert len(notes) == 1
    assert notes[0].project_version == 1


@pytest.mark.asyncio
async def test_bulk_insert_results(db_session, mock_results):
    """Test bulk insertion of results."""
    project_id = uuid.uuid4()

    await bulk_insert_results(project_id, mock_results, db_session)
    await db_session.commit()

    result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.project_id == project_id))
    notes = result.scalars().all()
    assert len(notes) == 1
    assert notes[0].rating == 72
    assert notes[0].title == "Title 1"


@pytest.mark.asyncio
async def test_get_plausibility_notes_returns_latest_version(db_session, mock_results, project_versions):
    project_id = uuid.uuid4()
    project_versions[project_id] = 2

    await bulk_insert_results(project_id, mock_results, db_session, project_version=1)
    await bulk_insert_results(project_id, mock_results, db_session, project_version=2)
    await db_session.commit()

    result = await get_plausibility_notes(project_id, db_session)

    assert len(result.contradictions) == 1
    assert result.contradictions[0].id == mock_results.contradictions[0].id


@pytest.mark.asyncio
async def test_update_and_delete_note_apply_to_latest_version(db_session, mock_results, project_versions):
    project_id = uuid.uuid4()
    project_versions[project_id] = 2
    note_id = mock_results.contradictions[0].id

    await bulk_insert_results(project_id, mock_results, db_session, project_version=1)
    await bulk_insert_results(project_id, mock_results, db_session, project_version=2)
    await db_session.commit()

    updated = await update_note_status(note_id, PlausibilityNoteStatus.RESOLVED, db_session)

    assert updated is not None
    assert updated.project_version == 2

    assert await delete_note(note_id, db_session)
    result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.id == note_id))
    remaining = result.scalars().all()
    assert len(remaining) == 1
    assert remaining[0].project_version == 1


@pytest.mark.asyncio
async def test_process_job_results(db_session, mock_results):
    """Test the full process of handling job results (mocking external fetch)."""
    project_id = uuid.uuid4()
    file_id = uuid.uuid4()

    # Pre-populate some old data to verify it gets deleted
    old_note = PlausibilityNote(
        id=uuid.uuid4(),
        project_id=project_id,
        title="Old title",
        description="old",
        status="OPEN",
    )
    db_session.add(old_note)
    await db_session.commit()

    with patch(
        "src.services.plausibility_notes_service.fetch_results_file",
        return_value=mock_results,
    ) as mock_fetch:
        await process_job_results(project_id, file_id, db_session)

        mock_fetch.assert_called_once_with(file_id, 1)

        # Verify DB: Old note should be gone, new one should be there
        result = await db_session.execute(select(PlausibilityNote).where(PlausibilityNote.project_id == project_id))
        notes = result.scalars().all()
        assert len(notes) == 1
        assert notes[0].rating == 72
        assert notes[0].title == "Title 1"
