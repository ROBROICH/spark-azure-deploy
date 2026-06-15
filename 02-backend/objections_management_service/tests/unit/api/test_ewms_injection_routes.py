"""Unit tests for the /ewms/injection-detected endpoint."""

import uuid
from typing import Any

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import BeteiligungsEingang
from src.models.schemas.objection_schemas import BeteiligungTyp, ClassificationStatus, ExtractionStatus


def _injection_payload(
    file_id: uuid.UUID, document_name: str = "doc.pdf", snippet: str | None = None
) -> dict[str, Any]:
    return {
        "documents": [
            {
                "file_id": str(file_id),
                "document_name": document_name,
                "snippet": snippet,
            }
        ]
    }


@pytest.mark.asyncio
async def test_mark_injection_detected_creates_new_beteiligungs_eingang(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    file_id = uuid.uuid4()

    response = await client.post(
        f"/{project_id}/ewms/injection-detected?project_version=1",
        json=_injection_payload(file_id, "einwendung.pdf", "IGNORE PREVIOUS INSTRUCTIONS"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    rows = (await db_session.execute(select(BeteiligungsEingang))).scalars().all()
    assert len(rows) == 1
    be = rows[0]
    assert be.file_id == file_id
    assert be.extraction_status == ExtractionStatus.PROMPT_INJECTION_ERROR
    assert be.classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_mark_injection_detected_updates_existing_beteiligungs_eingang(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    file_id = uuid.uuid4()
    existing = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        file_id=file_id,
        filename="old.pdf",
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.LOADING,
    )
    db_session.add(existing)
    await db_session.commit()

    response = await client.post(
        f"/{project_id}/ewms/injection-detected?project_version=1",
        json=_injection_payload(file_id, "old.pdf"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    await db_session.refresh(existing)
    assert existing.extraction_status == ExtractionStatus.PROMPT_INJECTION_ERROR
    assert existing.classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_mark_injection_detected_skips_already_done_beteiligungs_eingang(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    file_id = uuid.uuid4()
    existing = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        file_id=file_id,
        filename="done.pdf",
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.DONE,
    )
    db_session.add(existing)
    await db_session.commit()

    response = await client.post(
        f"/{project_id}/ewms/injection-detected?project_version=1",
        json=_injection_payload(file_id, "done.pdf"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 0}

    await db_session.refresh(existing)
    # Status unchanged — already DONE, skip
    assert existing.extraction_status == ExtractionStatus.SUCCESS


@pytest.mark.asyncio
async def test_mark_injection_detected_mixed_batch_skips_done_updates_others(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    done_file_id = uuid.uuid4()
    new_file_id = uuid.uuid4()
    existing_done = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        file_id=done_file_id,
        filename="done.pdf",
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.DONE,
    )
    db_session.add(existing_done)
    await db_session.commit()

    response = await client.post(
        f"/{project_id}/ewms/injection-detected?project_version=1",
        json={
            "documents": [
                {"file_id": str(done_file_id), "document_name": "done.pdf"},
                {"file_id": str(new_file_id), "document_name": "new.pdf"},
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    rows = (await db_session.execute(select(BeteiligungsEingang))).scalars().all()
    statuses = {be.file_id: be.extraction_status for be in rows}
    assert set(statuses) == {done_file_id, new_file_id}
    assert statuses[done_file_id] == ExtractionStatus.SUCCESS  # unchanged
    assert statuses[new_file_id] == ExtractionStatus.PROMPT_INJECTION_ERROR


@pytest.mark.asyncio
async def test_mark_injection_detected_empty_list_is_noop(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    response = await client.post(
        f"/{project_id}/ewms/injection-detected?project_version=1",
        json={"documents": []},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 0}

    rows = (await db_session.execute(select(BeteiligungsEingang))).scalars().all()
    assert len(rows) == 0
