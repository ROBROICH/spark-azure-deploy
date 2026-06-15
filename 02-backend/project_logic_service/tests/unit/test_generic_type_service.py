"""Tests for generic type service."""

import pytest

from src.models.db_models import ProjectType
from src.services.generic_type import generic_type_service

EXPECTED_TYPE_COUNT = 2


@pytest.mark.asyncio
async def test_list_types(db_session):
    """
    Integration test for list_types with a real AsyncSession.
    """
    test_data = [
        ProjectType(name="Type 1"),
        ProjectType(name="Type 2"),
    ]
    # Add some test data
    db_session.add_all(test_data)
    await db_session.commit()

    # Call list_types using the real session and model
    result = await generic_type_service.list_types(db=db_session, model=ProjectType)

    assert len(result) == EXPECTED_TYPE_COUNT
    assert all(isinstance(item, ProjectType) for item in result)


@pytest.mark.asyncio
async def test_get_type(db_session):
    """
    Integration test for get_type with a real AsyncSession.
    """
    test_data = [
        ProjectType(name="Type 1"),
        ProjectType(name="Type 2"),
    ]
    # Add some test data
    db_session.add_all(test_data)
    await db_session.commit()

    # Call get_type using the real session and model
    result = await generic_type_service.get_type(db=db_session, model=ProjectType, record_id=test_data[0].id)

    assert result is not None
    assert result.id == test_data[0].id
    assert result.name == "Type 1"
