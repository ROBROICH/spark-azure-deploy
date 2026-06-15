"""Test configuration and fixtures."""

import os

# Set test environment variables BEFORE any src imports happen.
# src/config/settings.py instantiates Settings() at module level.
_TEST_ENV_VARS = {
    "CORS_ORIGINS": "http://localhost",
    "DB_USER": "test",
    "DB_PASSWORD": "test",
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DB_NAME": "test_db",
    "SERVICE_NAME": "formal-completeness-check-test",
    "DOCUMENT_MANAGEMENT_SERVICE_URL": "http://localhost:8000",
    "PROJECT_LOGIC_SERVICE_URL": "http://localhost:9999",
}
for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)

import sys
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from audit_client.models import audit_log_table
from audit_client.models import metadata as audit_metadata
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, DefaultClause, event, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from src.models.db_models import Base

IN_MEMORY_DB_URL = "sqlite+aiosqlite:///:memory:"

_shared_engine: AsyncEngine | None = None
_shared_session_factory: async_sessionmaker[AsyncSession] | None = None
_sqlite_metadata_patched = False


def _patch_postgres_types_for_sqlite() -> None:
    """Swap PostgreSQL-only array columns for JSON in the SQLite unit harness."""
    global _sqlite_metadata_patched

    if _sqlite_metadata_patched:
        return

    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, ARRAY):
                column.type = JSON()
                column.server_default = None

    # audit_log_table.timestamp uses server_default=text("now()") which SQLite
    # rejects — swap it for CURRENT_TIMESTAMP so create_all + inserts work.
    audit_log_table.c.timestamp.server_default = DefaultClause(text("CURRENT_TIMESTAMP"))

    _sqlite_metadata_patched = True


def _get_shared_engine() -> AsyncEngine:
    global _shared_engine
    if _shared_engine is None:
        _shared_engine = create_async_engine(
            IN_MEMORY_DB_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(_shared_engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return _shared_engine


def _get_shared_session_factory() -> async_sessionmaker[AsyncSession]:
    global _shared_session_factory
    if _shared_session_factory is None:
        _shared_session_factory = async_sessionmaker(
            bind=_get_shared_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _shared_session_factory


async def _mock_get_db_session() -> AsyncIterator[AsyncSession]:
    async with _get_shared_session_factory()() as session:
        yield session


# Mock the database module to avoid PostgreSQL-specific pool settings at import
_mock_db_module = MagicMock()
_mock_db_module.async_engine = _get_shared_engine()
_mock_db_module.AsyncSessionLocal = _get_shared_session_factory()
_mock_db_module.get_db_session = _mock_get_db_session
sys.modules["src.models.db.database"] = _mock_db_module


@pytest_asyncio.fixture
async def async_engine() -> AsyncIterator[AsyncEngine]:
    """Provide test engine with fresh schema per test."""
    _patch_postgres_types_for_sqlite()
    engine = _get_shared_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(audit_metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(audit_metadata.drop_all)
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def session_factory(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Return session factory (depends on async_engine to ensure schema exists)."""
    return _get_shared_session_factory()


@pytest_asyncio.fixture
async def db_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Provide an async session for tests."""
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(
    async_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    """Provide an async test client with DB session override."""
    from src.main import app
    from src.models.db.database import get_db_session

    async def override_get_db_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client

    app.dependency_overrides.clear()
