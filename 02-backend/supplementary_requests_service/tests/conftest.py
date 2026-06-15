"""Test configuration and fixtures."""

import os
import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test DATABASE_URL before importing settings to avoid validation error
DATABASE_URL = "sqlite+aiosqlite:///file:testdb?mode=memory&cache=shared&uri=true"
os.environ["DATABASE_URL"] = DATABASE_URL
os.environ["AUTH_MODE"] = "disabled"
os.environ["TEMPORAL_JOB_SERVICE_URL"] = "http://localhost:9999"

from audit_client.models import metadata as audit_metadata  # noqa: E402

from src.config.settings import settings  # noqa: E402
from src.main import app  # noqa: E402
from src.models.db import database as db_module  # noqa: E402
from src.models.db.database import get_db_session  # noqa: E402
from src.models.db.db_models import Base, SupplementaryRequest  # noqa: E402
from src.models.db.enums import Priority, ProcessStep  # noqa: E402


@pytest.fixture(scope="function", autouse=True)
def override_database_url():
    """Override DATABASE_URL to use test database for all tests."""
    original_value = getattr(settings, "DATABASE_URL", None)
    settings.DATABASE_URL = DATABASE_URL

    db_module._async_engine = None
    db_module._AsyncSessionLocal = None

    yield

    # Restore original value and reset global engine again
    settings.DATABASE_URL = original_value
    db_module._async_engine = None
    db_module._AsyncSessionLocal = None


@pytest.fixture(scope="function")
def async_engine():
    """Initializes the async engine for tests."""
    test_engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        future=True,
    )

    # audit_log_table uses server_default=text("now()"), which SQLite doesn't
    # know — register it as a user-defined function on each connection.
    @event.listens_for(test_engine.sync_engine, "connect")
    def _register_sqlite_now(dbapi_connection, _):
        dbapi_connection.create_function("now", 0, lambda: datetime.now(UTC).isoformat(sep=" "))

    return test_engine


@pytest.fixture(scope="function")
def async_session_maker(async_engine):
    """Initializes the async session maker."""
    return async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


@pytest.fixture(scope="function")
async def db_session(async_session_maker):
    """Provides a clean session for each test."""
    async with async_session_maker() as session:
        yield session


@pytest.fixture(autouse=True, scope="function")
async def db_schema(async_engine):
    """Initializes the database schema using the test database engine."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(audit_metadata.create_all)
    yield
    async with async_engine.begin() as conn:
        await conn.run_sync(audit_metadata.drop_all)
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(name="client")
def client_fixture(db_session):
    """Fixture for unit tests - overrides database session."""

    def get_session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = get_session_override

    client = AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def create_test_supplementary_request(
    db_session: AsyncSession,
) -> SupplementaryRequest:
    """Create a test supplementary request."""
    project_id = uuid.uuid4()
    request_id = uuid.uuid4()

    request = SupplementaryRequest(
        id=request_id,
        project_id=project_id,
        title="Test Request",
        reason="Test reason",
        priority=Priority.MUST,
        process_step=ProcessStep.FORMAL_COMPLETENESS_CHECK,
        source_type=None,
        source_item_id=None,
        included_in_letter=False,
        topic_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
    )
    db_session.add(request)
    await db_session.commit()
    await db_session.refresh(request)
    return request
