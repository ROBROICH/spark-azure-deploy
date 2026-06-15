"""PGlite-backed integration test fixtures for node endpoints."""

import os
import sys
from collections.abc import AsyncIterator, Iterator
from uuid import uuid4

os.environ.setdefault("PSYCOPG_IMPL", "python")
os.environ.setdefault("AUTH_MODE", "disabled")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport
from py_pglite.config import PGliteConfig
from py_pglite.sqlalchemy.manager import SQLAlchemyPGliteManager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def pglite() -> Iterator[SQLAlchemyPGliteManager]:
    """Start PGlite and create all OMS node tables once per session."""
    from src.models.db_models import Base

    manager = SQLAlchemyPGliteManager(PGliteConfig())
    manager.start()
    manager.wait_for_ready()

    engine = manager.get_engine()
    Base.metadata.create_all(engine)
    engine.dispose()
    manager._shared_engine = None

    yield manager
    manager.stop()


@pytest.fixture(scope="session")
def db_session_factory(
    pglite: SQLAlchemyPGliteManager,
) -> async_sessionmaker[AsyncSession]:
    """Async session factory backed by PGlite."""
    url = pglite.config.get_connection_string(driver="psycopg")
    engine = create_async_engine(
        url,
        poolclass=StaticPool,
        connect_args={"prepare_threshold": None},
    )
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def api_client(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[httpx.AsyncClient]:
    """Async HTTP client talking to FastAPI in-process, backed by PGlite."""
    from src.main import app
    from src.models.db.database import get_db_session

    async def override_get_db_session() -> AsyncIterator[AsyncSession]:
        async with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def project_id() -> str:
    """Generate an isolated project ID for one test."""
    return str(uuid4())
