"""Tests for deadline service."""

from datetime import date
from uuid import uuid4

import pytest

from src.exceptions import DeadlineNotFoundError
from src.models.schemas.deadline_schemas import (
    CreateDeadlineRequest,
    UpdateDeadlineRequest,
)
from src.services.deadlines import deadline_service


@pytest.fixture
def create_deadline_data(create_test_project):
    return CreateDeadlineRequest(
        project_id=create_test_project.id,
        start_at=date(2025, 1, 1),
        end_at=date(2025, 12, 31),
        deadline_type="Frist",
        legal_basis="§ 3 BImSchG",
    )


@pytest.mark.asyncio
async def test_create_deadline(db_session, create_test_project, create_deadline_data):
    deadline = await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    assert deadline.id is not None
    assert deadline.project_id == create_test_project.id
    assert deadline.start_at == create_deadline_data.start_at
    assert deadline.end_at == create_deadline_data.end_at
    assert deadline.deadline_type == create_deadline_data.deadline_type
    assert deadline.legal_basis == create_deadline_data.legal_basis


@pytest.mark.asyncio
async def test_get_deadline(db_session, create_test_project, create_deadline_data):
    created = await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    found = await deadline_service.get_deadline(db=db_session, deadline_id=created.id)

    assert found is not None
    assert found.id == created.id


@pytest.mark.asyncio
async def test_list_deadlines_by_project(db_session, create_test_project, create_deadline_data):
    await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    result = await deadline_service.list_deadlines(
        db=db_session,
        project_id=create_test_project.id,
    )

    assert len(result) == 1
    assert result[0].project_id == create_test_project.id


@pytest.mark.asyncio
async def test_list_deadlines_all(db_session, create_test_project, create_deadline_data):
    await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    result = await deadline_service.list_deadlines(db=db_session)

    assert len(result) >= 1
    assert result[0].project_id == create_test_project.id


@pytest.mark.asyncio
async def test_list_deadlines_filtered_by_assigned_project_ids(db_session, create_test_project, create_deadline_data):
    await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    result = await deadline_service.list_deadlines(
        db=db_session,
        assigned_project_ids=[create_test_project.id],
    )

    assert len(result) == 1
    assert result[0].project_id == create_test_project.id


@pytest.mark.asyncio
async def test_list_deadlines_empty_assigned_ids(db_session, create_test_project, create_deadline_data):
    await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    result = await deadline_service.list_deadlines(
        db=db_session,
        assigned_project_ids=[],
    )

    assert len(result) == 0


@pytest.mark.asyncio
async def test_update_deadline(db_session, create_test_project, create_deadline_data):
    created = await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    updated_at = created.updated_at

    update_data = UpdateDeadlineRequest(
        start_at=date(2026, 1, 1),
        end_at=date(2026, 12, 31),
        legal_basis="Updated Basis",
    )

    updated = await deadline_service.update_deadline(
        db=db_session,
        deadline_id=created.id,
        deadline_data=update_data,
    )

    assert updated is not None
    assert updated.start_at == update_data.start_at
    assert updated.end_at == update_data.end_at
    assert updated.legal_basis == update_data.legal_basis
    assert updated.updated_at > updated_at


@pytest.mark.asyncio
async def test_update_deadline_not_found(db_session):
    update_data = UpdateDeadlineRequest(start_at=date(2026, 1, 1))

    with pytest.raises(DeadlineNotFoundError):
        await deadline_service.update_deadline(
            db=db_session,
            deadline_id=uuid4(),
            deadline_data=update_data,
        )


@pytest.mark.asyncio
async def test_delete_deadline(db_session, create_test_project, create_deadline_data):
    created = await deadline_service.create_deadline(
        db=db_session,
        deadline_data=create_deadline_data,
    )

    deleted = await deadline_service.delete_deadline(
        db=db_session,
        deadline_id=created.id,
    )

    assert deleted.id == created.id

    with pytest.raises(DeadlineNotFoundError):
        await deadline_service.get_deadline(db=db_session, deadline_id=created.id)


@pytest.mark.asyncio
async def test_delete_deadline_not_found(db_session):
    with pytest.raises(DeadlineNotFoundError):
        await deadline_service.delete_deadline(
            db=db_session,
            deadline_id=uuid4(),
        )
