"""Test configuration and fixtures for Objections Management Service."""

import os
import sys
import uuid
from datetime import UTC, datetime

# Ensure local src/ takes priority over other workspace members' src/ packages
# installed via .pth files (alphabetical ordering causes collision).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, event
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

IN_MEMORY_DB_URL = "sqlite+aiosqlite:///:memory:"


class _SharedTestState:
    engine: AsyncEngine | None = None
    session_factory: async_sessionmaker[AsyncSession] | None = None
    sqlite_metadata_patched: bool = False


def _get_shared_engine() -> AsyncEngine:
    if _SharedTestState.engine is None:
        _SharedTestState.engine = create_async_engine(
            IN_MEMORY_DB_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(_SharedTestState.engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
            # audit_log_table uses now() server_default (PostgreSQL-only); register for SQLite.
            dbapi_connection.create_function("now", 0, lambda: datetime.now(UTC).isoformat())

    return _SharedTestState.engine


def _get_shared_session_factory() -> async_sessionmaker[AsyncSession]:
    if _SharedTestState.session_factory is None:
        _SharedTestState.session_factory = async_sessionmaker(
            bind=_get_shared_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _SharedTestState.session_factory


async def _mock_get_db_session() -> AsyncIterator[AsyncSession]:
    async with _get_shared_session_factory()() as session:
        yield session


# Mock the database module to avoid PostgreSQL-specific pool settings at import
_mock_db_module = MagicMock()
_mock_db_module.async_engine = _get_shared_engine()
_mock_db_module.AsyncSessionLocal = _get_shared_session_factory()
_mock_db_module.get_db_session = _mock_get_db_session
sys.modules["src.models.db.database"] = _mock_db_module

from audit_client.models import audit_log_table  # noqa: E402

from src.models.db.database import get_db_session  # noqa: E402
from src.models.db_models import Argument, Base, BeteiligungsEingang, BeteiligungsEingangMarkdown  # noqa: E402
from src.models.schemas.objection_schemas import (  # noqa: E402
    ArgumentStatus,
    BeteiligungTyp,
    ClassificationStatus,
    ExtractionStatus,
)


def _patch_postgres_types_for_sqlite() -> None:
    """Swap PostgreSQL-only array columns for JSON in the SQLite unit harness."""
    if _SharedTestState.sqlite_metadata_patched:
        return

    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, ARRAY):
                column.type = JSON()
                column.server_default = None

    _SharedTestState.sqlite_metadata_patched = True


@pytest_asyncio.fixture
async def async_engine() -> AsyncIterator[AsyncEngine]:
    """Provide test engine with fresh schema per test."""
    _patch_postgres_types_for_sqlite()
    engine = _get_shared_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(audit_log_table.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(audit_log_table.metadata.drop_all)


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


@pytest.fixture
def project_id() -> uuid.UUID:
    """Generate a random project ID for testing."""
    return uuid.uuid4()


@pytest_asyncio.fixture
async def create_test_beteiligungs_eingang(db_session: AsyncSession, project_id: uuid.UUID) -> BeteiligungsEingang:
    """Create a test beteiligungs_eingang in the database."""
    markdown_id = uuid.uuid4()
    beteiligungs_eingang = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        beteiligung_typ=BeteiligungTyp.STELLUNGNAHME,
        file_id=uuid.uuid4(),
        beteiligungs_eingang_markdown_id=markdown_id,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.LOADING,
    )
    db_session.add(beteiligungs_eingang)
    db_session.add(
        BeteiligungsEingangMarkdown(
            id=markdown_id,
            project_id=project_id,
            beteiligungs_eingang_id=beteiligungs_eingang.id,
            text="# Test markdown",
        )
    )
    await db_session.commit()
    await db_session.refresh(beteiligungs_eingang)
    return beteiligungs_eingang


@pytest_asyncio.fixture
async def create_test_argument(
    db_session: AsyncSession, create_test_beteiligungs_eingang: BeteiligungsEingang
) -> Argument:
    """Create a test argument linked to a beteiligungs_eingang."""
    argument = Argument(
        id=uuid.uuid4(),
        project_id=create_test_beteiligungs_eingang.project_id,
        beteiligungs_eingang_id=create_test_beteiligungs_eingang.id,
        text="This is a test extracted argument",
        start_idx=12,
        end_idx=42,
        erwiderung="This is a draft response",
        einordnung="This is a topic classification",
        context="This is the grounded context for the extracted argument.",
        context_start_idx=0,
        context_end_idx=72,
        status=ArgumentStatus.OPEN,
        in_vae=False,
        is_valid_argument=True,
    )
    db_session.add(argument)
    await db_session.commit()
    await db_session.refresh(argument)
    return argument


@pytest_asyncio.fixture
async def create_test_objection(create_test_argument: Argument) -> Argument:
    """Backward-compatible alias for older tests that still request this fixture."""
    return create_test_argument
