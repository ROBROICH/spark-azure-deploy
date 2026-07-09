"""Test configuration and fixtures."""
import os

# Values only used for testing. Do not copy them in your production env
os.environ.setdefault("AUTH_MODE", "disabled")
os.environ.setdefault("TEMPORAL__S3_SECRET_ACCESS_KEY", "unit-test-secret")
os.environ.setdefault("TEMPORAL__S3_ACCESS_KEY_ID", "unit-test-key")

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Create a test client for the FastAPI app."""
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
