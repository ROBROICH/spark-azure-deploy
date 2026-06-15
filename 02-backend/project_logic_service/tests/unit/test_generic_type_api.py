"""Unit tests for generic type API (mocked services)."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import ProjectStatus, ProjectType
from src.services.generic_type import generic_type_service


@pytest.mark.asyncio
async def test_list_project_types():
    """Test list_project_types with mocked AsyncSession."""
    mock_session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()

    fake_rows = [
        ProjectType(id=uuid.UUID("11111111-1111-1111-1111-111111111111"), name="Type A"),
        ProjectType(id=uuid.UUID("22222222-2222-2222-2222-222222222222"), name="Type B"),
    ]
    mock_result.scalars.return_value.all.return_value = fake_rows

    mock_session.execute.return_value = mock_result

    # Call the service function with the mocked session and model
    result = await generic_type_service.list_types(db=mock_session, model=ProjectType)

    # Assert execute was called once with a select statement for ProjectType
    mock_session.execute.assert_awaited_once()
    args, _ = mock_session.execute.call_args
    stmt = args[0]
    # Check that the SQLAlchemy select was called with the correct model
    assert str(ProjectType.__table__) in str(stmt)

    # Service returns ORM models, not response schemas
    assert result == fake_rows


@pytest.mark.asyncio
async def test_list_project_statuses_includes_internal_name(client, db_session):
    """Test GET /project-statuses response includes internalName field."""
    status_obj = ProjectStatus(
        id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        name="Offen",
        internal_name="OPEN",
    )
    db_session.add(status_obj)
    await db_session.commit()

    response = await client.get("/project-statuses")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Offen"
    assert data[0]["internalName"] == "OPEN"
