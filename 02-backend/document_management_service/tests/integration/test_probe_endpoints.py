import pytest
from fastapi import status


@pytest.mark.integration
async def test_healthz_endpoint(integration_client):
    """GET /healthz returns 200 with ok status."""
    resp = await integration_client.get("/healthz")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == {"status": "ok"}


@pytest.mark.integration
async def test_readiness_check(integration_client):
    """GET /ready returns 200 when DB + storage + startup are all up."""
    resp = await integration_client.get("/ready")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == {"status": "ok"}


@pytest.mark.integration
async def test_startup_check(integration_client):
    """GET /startup returns 200 when app initialization is complete."""
    resp = await integration_client.get("/startup")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == {"status": "ok"}
