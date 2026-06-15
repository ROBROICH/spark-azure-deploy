"""Test configuration and fixtures."""

import os

_TEST_ENV_VARS = {
    "BACKEND_CORS_ORIGINS": "http://localhost",
    "DB_USER": "test",
    "DB_PASSWORD": "test",
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DB_NAME": "test_db",
    "SERVICE_NAME": "fpp-service-test",
    "PROJECT_LOGIC_SERVICE_URL": "http://localhost:8001",
    "LOG_LEVEL": "DEBUG",
    "SYSTEM_USER_ID": "00000000-0000-0000-0000-000000000001",
    "FPP_ALLOWED_DOMAINS": '["example.com"]',
    "FPP_BLOCK_PRIVATE_IPS": "True",
    "AUTH_MODE": "disabled",
}

for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.db.database import get_db_session


async def override_get_db():
    """Override database dependency for tests."""
    # Return a mock session that doesn't require actual database
    yield AsyncMock()


@pytest.fixture
def client(monkeypatch):
    """Create a test client for the FastAPI app."""
    monkeypatch.setattr("src.lifespan.run_alembic_upgrade", lambda *_, **__: None)
    app.dependency_overrides[get_db_session] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db_session():
    """Mock database session for testing without actual DB."""
    return AsyncMock()
