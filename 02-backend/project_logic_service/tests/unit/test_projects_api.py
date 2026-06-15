"""Unit tests for projects API (mocked services, excluding agent triggers)."""

import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status

from src.exceptions import InvalidStatusError, ProjectNotFoundError
from src.models.schemas.deadline_schemas import DeadlineResponse
from src.models.schemas.project_schemas import ProjectResponse


@pytest.fixture
def sample_project_dict():
    return {
        "id": str(uuid4()),
        "name": "Test Project",
        "projectTypeId": str(uuid4()),
        "projectTypeName": "test project type",
        "createdById": str(uuid4()),
        "entryDate": str(date(2025, 12, 14)),
        "statusId": str(uuid4()),
        "statusName": "Offen",
        "internalProjectNumber": "IPN-123",
        "location": "Berlin",
        "currentProcessStepId": str(uuid4()),
        "projectVersion": 1,
        "latestVersion": 1,
        "createdAt": datetime.now(UTC).isoformat(),
        "originalCreatedAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
        "userName": None,
    }


@pytest.mark.asyncio
@patch("src.services.projects.project_service.list_projects", new_callable=AsyncMock)
async def test_list_projects(mock_list_projects, sample_project_dict, client):
    """Test listing projects."""
    mock_list_projects.return_value = [ProjectResponse(**sample_project_dict)]

    response = await client.get("/projects")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()[0]["name"] == sample_project_dict["name"]


@pytest.mark.asyncio
@patch("src.services.projects.project_service.get_project", new_callable=AsyncMock)
@patch("src.services.projects.project_service.create_project", new_callable=AsyncMock)
async def test_create_project(mock_create_project, mock_get_project, sample_project_dict, client):
    """Test creating a project."""
    input_data = {
        k: v
        for k, v in sample_project_dict.items()
        if k
        not in (
            "id",
            "createdAt",
            "originalCreatedAt",
            "updatedAt",
            "userName",
            "statusName",
            "projectTypeName",
        )
    }
    mock_create_project.return_value = ProjectResponse(**sample_project_dict)
    mock_get_project.return_value = ProjectResponse(**sample_project_dict)

    response = await client.post("/projects", json=input_data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == sample_project_dict["name"]


@pytest.mark.asyncio
@patch("src.services.projects.project_service.get_project", new_callable=AsyncMock)
async def test_get_project_found(mock_get_project, sample_project_dict, client):
    """Test getting a project that exists."""
    mock_get_project.return_value = ProjectResponse(**sample_project_dict)
    project_id = sample_project_dict["id"]

    response = await client.get(f"/projects/{project_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == project_id


@pytest.mark.asyncio
@patch("src.services.projects.project_service.get_project", new_callable=AsyncMock)
async def test_get_project_not_found(mock_get_project, client):
    """Test getting a project that doesn't exist."""
    fake_id = str(uuid4())
    mock_get_project.side_effect = ProjectNotFoundError(fake_id)

    response = await client.get(f"/projects/{fake_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@patch("src.services.projects.project_service.get_project", new_callable=AsyncMock)
@patch("src.services.projects.project_service.update_project", new_callable=AsyncMock)
async def test_update_project_found(mock_update_project, mock_get_project, sample_project_dict, client):
    """Test updating a project that exists."""
    project_id = sample_project_dict["id"]
    update_data = {"name": "Updated Name", "location": "Munich"}
    updated = ProjectResponse(**{**sample_project_dict, **update_data})
    mock_update_project.return_value = updated
    mock_get_project.return_value = updated

    response = await client.patch(f"/projects/{project_id}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Updated Name"
    assert response.json()["location"] == "Munich"


@pytest.mark.asyncio
@patch("src.services.projects.project_service.update_project", new_callable=AsyncMock)
async def test_update_project_not_found(mock_update_project, client):
    """Test updating a project that doesn't exist."""
    fake_id = str(uuid4())
    mock_update_project.side_effect = ProjectNotFoundError(fake_id)

    response = await client.patch(f"/projects/{fake_id}", json={"name": "Doesn't Matter"})

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@patch("src.services.projects.project_service.get_project", new_callable=AsyncMock)
@patch(
    "src.services.projects.project_service.update_project_status",
    new_callable=AsyncMock,
)
async def test_update_project_status_found(mock_update_project_status, mock_get_project, sample_project_dict, client):
    """Test updating project status."""
    project_id = sample_project_dict["id"]

    updated = ProjectResponse(**{**sample_project_dict, "statusName": "In Bearbeitung"})
    mock_update_project_status.return_value = updated
    mock_get_project.return_value = updated

    response = await client.patch(
        f"/projects/{project_id}/status",
        json={"internalName": "IN_PROGRESS"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["statusName"] == "In Bearbeitung"


@pytest.mark.asyncio
async def test_update_project_status_not_found(client):
    """Test updating status for a project that doesn't exist."""
    fake_id = str(uuid4())

    with patch(
        "src.services.projects.project_service.update_project_status",
        new_callable=AsyncMock,
    ) as mock_update_project_status:
        mock_update_project_status.side_effect = ProjectNotFoundError(fake_id)

        response = await client.patch(
            f"/projects/{fake_id}/status",
            json={"internalName": "OPEN"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_update_project_status_invalid_status(client, sample_project_dict):
    """Test mapping InvalidStatusError from service to HTTP 400."""
    project_id = sample_project_dict["id"]

    with patch(
        "src.services.projects.project_service.update_project_status",
        new_callable=AsyncMock,
    ) as mock_update_project_status:
        mock_update_project_status.side_effect = InvalidStatusError("Invalid Status")

        response = await client.patch(
            f"/projects/{project_id}/status",
            json={"internalName": "OPEN"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_project_status_invalid_payload_returns_422(client, sample_project_dict):
    """Test enum validation for status payload."""
    project_id = sample_project_dict["id"]

    response = await client.patch(
        f"/projects/{project_id}/status",
        json={"internalName": "INVALID_STATUS"},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
@patch("src.services.projects.project_service.start_project_deletion", new_callable=AsyncMock)
async def test_delete_project_returns_204(mock_delete, client):
    """DELETE /projects/{id} returns 204 on success."""
    project_id = str(uuid4())
    mock_delete.return_value = None

    response = await client.delete(f"/projects/{project_id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    mock_delete.assert_awaited_once()


@pytest.mark.asyncio
@patch("src.services.projects.project_service.start_project_deletion", new_callable=AsyncMock)
async def test_delete_project_not_found_returns_404(mock_delete, client):
    """DELETE /projects/{id} returns 404 when project not found or already deleted."""
    fake_id = str(uuid4())
    mock_delete.side_effect = ProjectNotFoundError(fake_id)

    response = await client.delete(f"/projects/{fake_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_list_project_deadlines(client):
    """Test listing deadlines for a project."""
    project_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380010")

    expected_list = [
        DeadlineResponse(
            id=uuid4(),
            project_id=project_id,
            start_at=date(2026, 8, 4),
            end_at=date(2027, 8, 4),
            deadline_type="Frist",
            legal_basis=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    ]

    with patch(
        "src.services.deadlines.deadline_service.list_deadlines",
        return_value=expected_list,
    ) as mock_list:
        response = await client.get(f"/deadlines?project_id={project_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    mock_list.assert_awaited_once()
