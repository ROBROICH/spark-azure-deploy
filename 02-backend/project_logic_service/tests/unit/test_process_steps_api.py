"""Unit tests for process steps API (mocked services)."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status

from src.exceptions import ProcessStepNotFoundError
from src.models.schemas.process_step_schemas import ProcessStepResponse


@pytest.fixture
def sample_process_step_dict():
    return {
        "id": str(uuid4()),
        "name": "Test Process Step",
        "projectTypeId": str(uuid4()),
        "processStepIndex": 0,
    }


@pytest.mark.asyncio
@patch(
    "src.services.process_steps.process_step_service.list_process_steps",
    new_callable=AsyncMock,
)
async def test_list_process_steps(mock_list_process_step, sample_process_step_dict, client):
    """Test listing process steps."""
    mock_list_process_step.return_value = [ProcessStepResponse(**sample_process_step_dict)]

    response = await client.get(f"/process-steps?project_type_id={sample_process_step_dict['projectTypeId']}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()[0]["name"] == sample_process_step_dict["name"]


@pytest.mark.asyncio
@patch(
    "src.services.process_steps.process_step_service.get_process_step",
    new_callable=AsyncMock,
)
async def test_get_process_step(mock_get_process_step, sample_process_step_dict, client):
    """Test getting a specific process step."""
    mock_get_process_step.return_value = ProcessStepResponse(**sample_process_step_dict)
    process_step_id = sample_process_step_dict["id"]

    response = await client.get(f"/process-steps/{process_step_id}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == process_step_id


@pytest.mark.asyncio
@patch(
    "src.services.process_steps.process_step_service.get_process_step",
    new_callable=AsyncMock,
)
async def test_get_process_step_not_found(mock_get_process_step, client):
    """Test retrieving a non-existent process step."""
    process_step_id = uuid4()
    mock_get_process_step.side_effect = ProcessStepNotFoundError(str(process_step_id))

    response = await client.get(f"/process-steps/{process_step_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
