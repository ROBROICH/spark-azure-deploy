"""Test configuration and fixtures."""

import os
from collections.abc import AsyncIterator, Iterator
from unittest.mock import AsyncMock

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_USER", "postgres")
os.environ.setdefault("DB_PASSWORD", "postgres")
os.environ.setdefault("PROJECT_LOGIC_SERVICE_URL", "http://localhost:8001")

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.db.database import get_db_session


async def _mock_db_session() -> AsyncIterator[AsyncMock]:
    yield AsyncMock()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setitem(app.dependency_overrides, get_db_session, _mock_db_session)
    monkeypatch.setattr("src.utils.lifespan.run_alembic_upgrade", lambda *_, **__: None)
    with TestClient(app) as test_client:
        yield test_client
