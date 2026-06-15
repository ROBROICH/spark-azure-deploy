"""Test configuration and fixtures."""

import os
from collections.abc import AsyncGenerator, Generator
from typing import Any
from uuid import UUID

# Set test DATABASE_URL
os.environ["DB_HOST"] = "localhost"
os.environ["DB_NAME"] = "test"
os.environ["DB_USER"] = "postgres"
os.environ["DB_PASSWORD"] = "postgres"

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.db.database import get_db_session
from src.models.db.enums import ProcessStep, SourceType


def _populate_defaults(instance: Any) -> None:
    if getattr(instance, "id", None) is None:
        instance.id = uuid4()
    if getattr(instance, "created_at", None) is None:
        instance.created_at = datetime.now(UTC)
    if getattr(instance, "updated_at", None) is None:
        instance.updated_at = datetime.now(UTC)


class _FakeComment:
    """Lightweight stand-in for a Comment DB row (avoids SQLAlchemy ORM init)."""

    def __init__(self, project_id: UUID | None = None, **kwargs: Any) -> None:
        self.id = uuid4()
        self.project_id = project_id or uuid4()
        self.title = kwargs.get("title", "Test title")
        self.content = kwargs.get("content", "Test content")
        self.process_step = kwargs.get("process_step", ProcessStep.UNSORTED)
        self.source_type = kwargs.get("source_type")
        self.source_item_id = kwargs.get("source_item_id")
        self.created_at = datetime.now(UTC)
        self.updated_at = datetime.now(UTC)


def _make_comment(project_id: UUID | None = None, **kwargs: Any) -> _FakeComment:
    return _FakeComment(project_id=project_id, **kwargs)


def _build_mock_db(comments: list[_FakeComment]) -> AsyncMock:
    """Build a mock AsyncSession."""
    mock = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = comments[0] if comments else None
    mock_result.scalars.return_value.all.return_value = comments
    mock.execute.return_value = mock_result
    mock.add = MagicMock()
    mock.refresh.side_effect = _populate_defaults
    return mock


async def _mock_db_session() -> AsyncGenerator[AsyncMock]:
    yield _build_mock_db([])


async def _mock_db_session_with_comment(comment: _FakeComment) -> AsyncGenerator[AsyncMock]:
    yield _build_mock_db([comment])


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient]:
    app.dependency_overrides[get_db_session] = _mock_db_session
    monkeypatch.setattr("src.utils.lifespan.run_alembic_upgrade", lambda *_, **__: None)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def existing_comment() -> _FakeComment:
    return _make_comment()


@pytest.fixture
def client_with_comment(
    monkeypatch: pytest.MonkeyPatch, existing_comment: _FakeComment
) -> Generator[tuple[TestClient, _FakeComment]]:
    async def _session() -> AsyncGenerator[AsyncMock]:
        async for s in _mock_db_session_with_comment(existing_comment):
            yield s

    app.dependency_overrides[get_db_session] = _session
    monkeypatch.setattr("src.utils.lifespan.run_alembic_upgrade", lambda *_, **__: None)
    with TestClient(app) as test_client:
        yield test_client, existing_comment
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_inconsistent_source_comment(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, _FakeComment]]:
    comment = _make_comment(
        source_type=SourceType.MATERIAL_NORM,
        source_item_id=None,
    )

    async def _session() -> AsyncGenerator[AsyncMock]:
        async for s in _mock_db_session_with_comment(comment):
            yield s

    app.dependency_overrides[get_db_session] = _session
    monkeypatch.setattr("src.utils.lifespan.run_alembic_upgrade", lambda *_, **__: None)
    with TestClient(app) as test_client:
        yield test_client, comment
    app.dependency_overrides.clear()
