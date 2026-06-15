import re

import httpx
import pytest
import pytest_asyncio
from audit_client.models import metadata as audit_metadata
from httpx import ASGITransport
from py_pglite.config import PGliteConfig
from py_pglite.sqlalchemy.manager import SQLAlchemyPGliteManager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture(scope="session")
def pglite():
    """Start PGlite and create all tables once per session."""
    from src.models.db_models import Base

    manager = SQLAlchemyPGliteManager(PGliteConfig())
    manager.start()
    manager.wait_for_ready()

    engine = manager.get_engine()
    Base.metadata.create_all(engine)
    audit_metadata.create_all(engine)
    engine.dispose()
    manager._shared_engine = None

    yield manager
    manager.stop()


@pytest.fixture(scope="session")
def _db_session_factory(pglite):
    """Async session factory backed by PGlite (psycopg driver, Unix socket)."""
    url = pglite.config.get_connection_string(driver="psycopg")
    engine = create_async_engine(
        url,
        poolclass=StaticPool,
        connect_args={"prepare_threshold": None},
    )
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def integration_client(_db_session_factory, mock_project_logic_version_endpoints):
    """Async HTTP client talking to FastAPI in-process, backed by PGlite."""
    from src.main import app
    from src.models.db.database import get_db_session

    async def override_get_db():
        async with _db_session_factory() as session:
            yield session
            await session.rollback()

    app.dependency_overrides[get_db_session] = override_get_db
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_project_logic_version_endpoints(httpx_mock):
    httpx_mock.add_response(
        method="POST",
        url=re.compile(r"http://localhost:18000/projects/[^/]+/version-lock/validate-write"),
        json={"latest_version": 1},
        is_optional=True,
        is_reusable=True,
    )


@pytest_asyncio.fixture
async def db_session(_db_session_factory):
    """Provide an async session backed by PGlite for service-level tests."""
    async with _db_session_factory() as session:
        yield session
        await session.rollback()
