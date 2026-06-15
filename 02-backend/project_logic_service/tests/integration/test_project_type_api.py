"""Integration tests for project type API (real database, no mocks)."""

import pytest
from fastapi import status

PROJECT_TYPE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380001"
EXPECTED_CREATED_TYPE_COUNT = 2  # number of project types created in the bulk-create payload


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_project_types(integration_client, seed_base_data):
    """Test listing project types."""
    response = await integration_client.get("/project-types")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all("id" in item and "name" in item for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_project_types(integration_client, seed_base_data):
    """Test bulk-creating project types."""
    response = await integration_client.post(
        "/project-types",
        json=[{"name": "New Type A"}, {"name": "New Type B"}],
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert len(data) == EXPECTED_CREATED_TYPE_COUNT
    assert all("id" in item and "name" in item for item in data)
    names = [item["name"] for item in data]
    assert "New Type A" in names
    assert "New Type B" in names


@pytest.mark.asyncio
@pytest.mark.integration
async def test_patch_project_types(integration_client, seed_base_data):
    """Test bulk-updating project types."""
    response = await integration_client.patch(
        "/project-types",
        json=[{"id": PROJECT_TYPE_ID, "name": "Updated Type"}],
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == PROJECT_TYPE_ID
    assert data[0]["name"] == "Updated Type"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_patch_project_types_unknown_id_skipped(integration_client, seed_base_data):
    """Test patching a project type with an unknown ID silently skips it."""
    unknown_id = "00000000-0000-0000-0000-000000000000"
    response = await integration_client.patch(
        "/project-types",
        json=[{"id": unknown_id, "name": "Ghost"}],
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_project_types(integration_client, seed_base_data):
    """Test bulk-deleting project types."""
    # Create a standalone type with no FK references so deletion succeeds
    create_resp = await integration_client.post(
        "/project-types",
        json=[{"name": "Deletable Type"}],
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    deletable_id = create_resp.json()[0]["id"]

    response = await integration_client.delete(
        f"/project-types?ids={deletable_id}",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Verify the type is gone
    list_response = await integration_client.get("/project-types")
    data = list_response.json()
    ids = [item["id"] for item in data]
    assert deletable_id not in ids


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_project_types_not_found(integration_client, seed_base_data):
    """Test deleting a project type with an unknown ID returns 404."""
    unknown_id = "00000000-0000-0000-0000-000000000000"
    response = await integration_client.delete(f"/project-types?ids={unknown_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_duplicate_project_type(integration_client, seed_base_data):
    """Test creating a project type with a name that already exists returns 409."""
    response = await integration_client.post(
        "/project-types",
        json=[{"name": "Fernstraße"}],  # name already seeded
    )

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_duplicate_within_payload(integration_client, seed_base_data):
    """Test creating project types with duplicate names within the same payload returns 409."""
    response = await integration_client.post(
        "/project-types",
        json=[{"name": "UniqueA"}, {"name": "UniqueA"}],
    )

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
@pytest.mark.integration
async def test_patch_duplicate_name(integration_client, seed_base_data):
    """Test updating a project type to a name already taken by another type returns 409."""
    # Create a second type to attempt renaming
    create_response = await integration_client.post(
        "/project-types",
        json=[{"name": "Second Type"}],
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    second_id = create_response.json()[0]["id"]

    # Try to rename it to the already-seeded name
    response = await integration_client.patch(
        "/project-types",
        json=[{"id": second_id, "name": "Fernstraße"}],
    )

    assert response.status_code == status.HTTP_409_CONFLICT
