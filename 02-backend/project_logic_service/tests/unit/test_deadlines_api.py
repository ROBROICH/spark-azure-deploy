"""Unit tests for deadlines API (mocked services)."""

import uuid
from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest
from fastapi import status

from src.exceptions import DeadlineNotFoundError
from src.models.schemas.deadline_schemas import DeadlineResponse

project_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380010")
project_id_b = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380011")
deadline_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380020")
deadline_id_b = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380021")

EXPECTED_ALL_DEADLINE_COUNT = 2  # number of deadlines seeded across all projects


@pytest.mark.asyncio
async def test_list_deadlines_all(client):
    """Test listing all deadlines without project filter."""
    deadlines = [
        DeadlineResponse(
            id=deadline_id,
            project_id=project_id,
            start_at=date(2026, 8, 4),
            end_at=date(2027, 8, 4),
            deadline_type="Frist",
            legal_basis=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        DeadlineResponse(
            id=deadline_id_b,
            project_id=project_id_b,
            start_at=date(2026, 9, 1),
            end_at=date(2027, 9, 1),
            deadline_type="Frist",
            legal_basis=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    ]

    with patch(
        "src.services.deadlines.deadline_service.list_deadlines",
        return_value=deadlines,
    ) as mock_list:
        response = await client.get("/deadlines")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == EXPECTED_ALL_DEADLINE_COUNT
    project_ids = {item["projectId"] for item in data}
    assert project_ids == {str(project_id), str(project_id_b)}
    mock_list.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_deadlines_filtered_by_project(client):
    """Test listing deadlines filtered by projectId query param."""
    deadlines = [
        DeadlineResponse(
            id=deadline_id,
            project_id=project_id,
            start_at=date(2026, 8, 4),
            end_at=date(2027, 8, 4),
            deadline_type="Frist",
            legal_basis=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    ]

    with patch(
        "src.services.deadlines.deadline_service.list_deadlines",
        return_value=deadlines,
    ) as mock_list:
        response = await client.get(f"/deadlines?project_id={project_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["projectId"] == str(project_id)
    mock_list.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_deadlines_empty(client):
    """Test listing deadlines returns empty list."""
    with patch(
        "src.services.deadlines.deadline_service.list_deadlines",
        return_value=[],
    ) as mock_list:
        response = await client.get("/deadlines")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []
    mock_list.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_deadline_success(client):
    """Test creating a deadline."""
    payload = {
        "projectId": str(project_id),
        "startAt": "2026-08-04",
        "endAt": "2027-08-04",
        "deadlineType": "Frist",
        "legalBasis": "§ 5 Absatz 1 Satz 2 BGB",
    }
    expected_response = DeadlineResponse(
        id=deadline_id,
        project_id=project_id,
        start_at=date.fromisoformat(payload["startAt"]),
        end_at=date.fromisoformat(payload["endAt"]),
        deadline_type=payload["deadlineType"],
        legal_basis=payload["legalBasis"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    with patch(
        "src.services.deadlines.deadline_service.create_deadline",
        return_value=expected_response,
    ) as mock_create:
        response = await client.post("/deadlines", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["projectId"] == str(project_id)
    assert data["legalBasis"] == payload["legalBasis"]
    mock_create.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_deadline_success(client):
    """Test updating a deadline."""
    payload = {
        "startAt": "2026-08-05",
        "endAt": "2027-08-05",
        "deadlineType": "Frist",
        "legalBasis": "Updated basis",
    }
    updated_deadline = DeadlineResponse(
        id=deadline_id,
        project_id=project_id,
        start_at=date.fromisoformat(payload["startAt"]),
        end_at=date.fromisoformat(payload["endAt"]),
        deadline_type=payload["deadlineType"],
        legal_basis=payload["legalBasis"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    with patch(
        "src.services.deadlines.deadline_service.update_deadline",
        return_value=updated_deadline,
    ) as mock_update:
        response = await client.patch(f"/deadlines/{deadline_id}", json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["legalBasis"] == payload["legalBasis"]
    mock_update.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_deadline_not_found(client):
    """Test updating a deadline that doesn't exist."""
    payload = {
        "startAt": "2026-08-05",
        "endAt": "2027-08-05",
        "deadlineType": "Frist",
    }

    with patch(
        "src.services.deadlines.deadline_service.update_deadline",
        side_effect=DeadlineNotFoundError(str(deadline_id)),
    ):
        response = await client.patch(f"/deadlines/{deadline_id}", json=payload)

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_get_deadline_success(client):
    """Test getting a deadline."""
    expected_deadline = DeadlineResponse(
        id=deadline_id,
        project_id=project_id,
        start_at=date(2026, 8, 4),
        end_at=date(2027, 8, 4),
        deadline_type="Frist",
        legal_basis=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    with patch(
        "src.services.deadlines.deadline_service.get_deadline",
        return_value=expected_deadline,
    ):
        response = await client.get(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(deadline_id)


@pytest.mark.asyncio
async def test_get_deadline_not_found(client):
    """Test getting a deadline that doesn't exist."""
    with patch(
        "src.services.deadlines.deadline_service.get_deadline",
        side_effect=DeadlineNotFoundError(str(deadline_id)),
    ):
        response = await client.get(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_delete_deadline_success(client):
    """Test deleting a deadline."""
    deleted_deadline = DeadlineResponse(
        id=deadline_id,
        project_id=project_id,
        start_at=date(2026, 8, 4),
        end_at=date(2027, 8, 4),
        deadline_type="Frist",
        legal_basis=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    with patch(
        "src.services.deadlines.deadline_service.delete_deadline",
        return_value=deleted_deadline,
    ) as mock_delete:
        response = await client.delete(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(deadline_id)
    mock_delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_deadline_not_found(client):
    """Test deleting a deadline that doesn't exist."""
    with patch(
        "src.services.deadlines.deadline_service.delete_deadline",
        side_effect=DeadlineNotFoundError(str(deadline_id)),
    ):
        response = await client.delete(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
