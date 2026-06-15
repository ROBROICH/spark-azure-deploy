"""Integration tests for deadlines API (real database, no mocks)."""

import uuid

import pytest
from fastapi import status

deadline_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380020")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_deadline_success(integration_client, create_test_project):
    """Test creating a deadline."""
    payload = {
        "projectId": str(create_test_project.id),
        "startAt": "2026-08-04",
        "endAt": "2027-08-04",
        "deadlineType": "Frist",
        "legalBasis": "§ 5 Absatz 1 Satz 2 BGB",
    }

    response = await integration_client.post("/deadlines", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["projectId"] == str(create_test_project.id)
    assert data["legalBasis"] == payload["legalBasis"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_deadline_success(integration_client, create_test_deadline):
    """Test updating a deadline."""
    payload = {
        "startAt": "2026-08-05",
        "endAt": "2027-08-05",
        "deadlineType": "Frist",
        "legalBasis": "Updated basis",
    }

    response = await integration_client.patch(f"/deadlines/{create_test_deadline.id}", json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["legalBasis"] == payload["legalBasis"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_deadline_not_found(integration_client):
    """Test updating a deadline that doesn't exist."""
    payload = {
        "startAt": "2026-08-05",
        "endAt": "2027-08-05",
        "deadlineType": "Frist",
    }

    response = await integration_client.patch(f"/deadlines/{deadline_id}", json=payload)

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_deadline_success(integration_client, create_test_deadline):
    """Test getting a deadline."""
    response = await integration_client.get(f"/deadlines/{create_test_deadline.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(create_test_deadline.id)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_deadline_not_found(integration_client):
    """Test getting a deadline that doesn't exist."""
    response = await integration_client.get(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_deadline_success(integration_client, create_test_deadline):
    """Test deleting a deadline."""
    response = await integration_client.delete(f"/deadlines/{create_test_deadline.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(create_test_deadline.id)

    # Verify it's deleted
    get_response = await integration_client.get(f"/deadlines/{create_test_deadline.id}")
    assert get_response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_deadline_not_found(integration_client):
    """Test deleting a deadline that doesn't exist."""
    response = await integration_client.delete(f"/deadlines/{deadline_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_deadlines_for_project(integration_client, create_test_project, create_test_deadline):
    """Test listing deadlines filtered by project."""
    project_id = str(create_test_project.id)

    response = await integration_client.get(f"/deadlines?project_id={create_test_project.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all(item["projectId"] == project_id for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_deadlines_all(integration_client, create_test_project, create_test_deadline):
    """Test listing all deadlines without project filter."""
    response = await integration_client.get("/deadlines")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
