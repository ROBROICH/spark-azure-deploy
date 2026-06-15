"""Tests for process step service."""

import uuid

import pytest

from src.exceptions import ProcessStepNotFoundError
from src.models.db_models import ProcessStep, ProjectType
from src.services.process_steps import process_step_service

EXPECTED_FILTERED_STEP_COUNT = 2


@pytest.fixture
async def seeded_db(db_session):
    # Prepare test data
    project_type_id = uuid.uuid4()
    other_project_type_id = uuid.uuid4()
    db_session.add_all(
        [
            ProjectType(id=project_type_id, name="Primary Type"),
            ProjectType(id=other_project_type_id, name="Other Type"),
        ]
    )
    steps = [
        ProcessStep(
            id=uuid.uuid4(),
            process_step_index=1,
            project_type_id=project_type_id,
            name="Step 1",
        ),
        ProcessStep(
            id=uuid.uuid4(),
            process_step_index=2,
            project_type_id=project_type_id,
            name="Step 2",
        ),
        ProcessStep(
            id=uuid.uuid4(),
            process_step_index=3,
            project_type_id=other_project_type_id,
            name="Other Step",
        ),
    ]
    db_session.add_all(steps)
    await db_session.commit()
    return db_session, project_type_id, steps


@pytest.mark.asyncio
async def test_list_all_process_steps(seeded_db):
    db, _, steps = seeded_db
    result = await process_step_service.list_process_steps(db)
    assert len(result) == len(steps)
    assert all(isinstance(s, ProcessStep) for s in result)


@pytest.mark.asyncio
async def test_list_process_steps_filtered(seeded_db):
    db, project_type_id, _steps = seeded_db
    filtered = await process_step_service.list_process_steps(db, project_type_id=project_type_id)
    assert all(s.project_type_id == project_type_id for s in filtered)
    assert len(filtered) == EXPECTED_FILTERED_STEP_COUNT  # Only first two match


@pytest.mark.asyncio
async def test_get_existing_process_step(seeded_db):
    db, _, steps = seeded_db
    step = steps[0]
    result = await process_step_service.get_process_step(db, process_step_id=step.id)
    assert result is not None
    assert result.id == step.id
    assert result.name == "Step 1"


@pytest.mark.asyncio
async def test_get_non_existing_process_step(seeded_db):
    db, _, _ = seeded_db
    with pytest.raises(ProcessStepNotFoundError):
        await process_step_service.get_process_step(db, process_step_id=uuid.uuid4())
