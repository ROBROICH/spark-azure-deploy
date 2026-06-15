"""Integration tests for process steps API (real database, no mocks)."""

import uuid

import pytest
from fastapi import status


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_process_steps(integration_client, seed_base_data):
    """Test listing all process steps."""
    response = await integration_client.get("/process-steps")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all("id" in item and "name" in item for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_process_steps_filtered(integration_client, seed_base_data):
    """Test listing process steps filtered by project_type_id."""
    project_type_id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380001"

    response = await integration_client.get(f"/process-steps?project_type_id={project_type_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all(item["projectTypeId"] == project_type_id for item in data)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_process_step(integration_client, seed_base_data):
    """Test getting a specific process step."""
    process_step_id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380005"

    response = await integration_client.get(f"/process-steps/{process_step_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == process_step_id
    assert data["name"] == "Formale Vollständigkeitsprüfung"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_process_step_not_found(integration_client):
    """Test getting a process step that doesn't exist."""
    process_step_id = str(uuid.uuid4())

    response = await integration_client.get(f"/process-steps/{process_step_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
