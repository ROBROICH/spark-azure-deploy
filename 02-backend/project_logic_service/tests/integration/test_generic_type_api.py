"""Integration tests for generic type API (real database, no mocks)."""

import pytest
from fastapi import status

SEEDED_STATUS_COUNT = 4  # number of project statuses seeded by seed_base_data


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_project_statuses(integration_client, seed_base_data):
    """Test listing project statuses."""
    response = await integration_client.get("/project-statuses")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= SEEDED_STATUS_COUNT
    assert all("id" in item and "name" in item and "internalName" in item for item in data)
    # Verify expected statuses exist
    status_names = [item["name"] for item in data]
    assert "Offen" in status_names
    assert "In Bearbeitung" in status_names
    assert "In Erstellung" in status_names
    assert "Abgeschlossen" in status_names
    # Verify internal_name values are correct
    internal_names = {item["internalName"] for item in data}
    assert {"IN_CREATION", "OPEN", "IN_PROGRESS", "COMPLETED"}.issubset(internal_names)
