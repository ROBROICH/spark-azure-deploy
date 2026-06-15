"""Integration tests for projects API (real database, no mocks)."""

import uuid

import pytest
from fastapi import status


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_project(integration_client, seed_base_data):
    """Test creating a new project."""
    project_type_id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380001"
    payload = {
        "name": "New Test Project",
        "projectTypeId": project_type_id,
        "entryDate": "2025-01-15",
        "internalProjectNumber": "TEST-456",
        "location": "Berlin",
        "createdById": str(uuid.uuid4()),
    }

    response = await integration_client.post("/projects", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["projectTypeId"] == project_type_id
    assert data["internalProjectNumber"] == payload["internalProjectNumber"]

    topics_response = await integration_client.get(
        "/topics",
        params={"projectId": data["id"]},
    )
    assert topics_response.status_code == status.HTTP_200_OK
    topics = topics_response.json()
    assert len(topics) > 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_project(integration_client, create_test_project):
    """Test getting a project by ID."""
    project_id = str(create_test_project.id)

    response = await integration_client.get(f"/projects/{project_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == project_id
    assert data["name"] == create_test_project.name


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_project_not_found(integration_client):
    """Test getting a project that doesn't exist."""
    project_id = str(uuid.uuid4())

    response = await integration_client.get(f"/projects/{project_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_projects(integration_client, create_test_project):
    """Test listing projects."""
    response = await integration_client.get("/projects")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert any(item["id"] == str(create_test_project.id) for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_projects_filtered_by_name(integration_client, create_test_project):
    """Test listing projects filtered by name."""
    response = await integration_client.get("/projects?name=Test")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all("Test" in item["name"] for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_projects_filtered_by_status(integration_client, create_test_project):
    """Test listing projects filtered by status."""
    response = await integration_client.get("/projects?status=OPEN")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert any(item["id"] == str(create_test_project.id) for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_project(integration_client, create_test_project):
    """Test updating a project."""
    project_id = str(create_test_project.id)
    payload = {
        "name": "Updated Project Name",
        "location": "Munich",
    }

    response = await integration_client.patch(f"/projects/{project_id}", json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == project_id
    assert data["name"] == "Updated Project Name"
    assert data["location"] == "Munich"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_project_not_found(integration_client):
    """Test updating a project that doesn't exist."""
    project_id = str(uuid.uuid4())
    payload = {"name": "Updated Name"}

    response = await integration_client.patch(f"/projects/{project_id}", json=payload)

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_project_status(integration_client, create_test_project):
    """Test updating project status."""
    project_id = str(create_test_project.id)
    payload = {"internalName": "IN_PROGRESS"}

    response = await integration_client.patch(f"/projects/{project_id}/status", json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == project_id
    assert data["statusName"] == "In Bearbeitung"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_project_status_not_found(integration_client):
    """Test updating status for a project that doesn't exist."""
    project_id = str(uuid.uuid4())
    payload = {"internalName": "OPEN"}

    response = await integration_client.patch(f"/projects/{project_id}/status", json=payload)

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_project_status_invalid_status(integration_client, create_test_project):
    """Test updating project status with invalid status name."""
    project_id = str(create_test_project.id)
    payload = {"internalName": "INVALID_STATUS"}

    response = await integration_client.patch(f"/projects/{project_id}/status", json=payload)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_project_deadlines(integration_client, create_test_project, create_test_deadline):
    """Test listing deadlines for a project."""
    project_id = str(create_test_project.id)

    response = await integration_client.get("/deadlines", params={"project_id": project_id})

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all(item["projectId"] == project_id for item in data)
