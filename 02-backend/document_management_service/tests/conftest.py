import os
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

_env_override = os.environ.get("ENV_OVERRIDE")
if _env_override:
    from dotenv import load_dotenv

    load_dotenv(Path(_env_override), override=True)

if os.environ.get("INTEGRATION_TEST"):
    os.environ["DOC_STORE_PATH"] = "integration_tests"

# Values only used for testing. Do not copy them in your production env
os.environ.setdefault("AUTH_MODE", "disabled")
os.environ.setdefault("DB_PASSWORD", "unit-test-password")
os.environ.setdefault("TEMPORAL__S3_SECRET_ACCESS_KEY", "unit-test-secret")
os.environ.setdefault("TEMPORAL__S3_ACCESS_KEY_ID", "unit-test-key")
os.environ.setdefault("S3_ACCESS_KEY_ID", "unit-test-secret")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "unit-test-key")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from py_pglite.config import PGliteConfig  # noqa: E402
from py_pglite.sqlalchemy.manager_async import SQLAlchemyAsyncPGliteManager  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)

from src.main import app  # noqa: E402
from src.models.db.database import get_db_session  # noqa: E402
from src.models.db.db_models import Base  # noqa: E402


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        item.add_marker(pytest.mark.timeout(120))


@pytest_asyncio.fixture(scope="session")
async def pglite() -> AsyncIterator[SQLAlchemyAsyncPGliteManager]:
    if not shutil.which("npm"):
        pytest.skip("npm not available (required by py-pglite)")
    manager = SQLAlchemyAsyncPGliteManager(PGliteConfig())
    manager.start()
    await manager.wait_for_ready()
    yield manager
    await manager.stop()


@pytest_asyncio.fixture(scope="session")
async def async_engine(pglite: SQLAlchemyAsyncPGliteManager) -> AsyncIterator[AsyncEngine]:
    """
    Initializes the async engine.
    """
    async_engine = pglite.get_engine()

    import src.models.db.database as db_module

    db_module.async_engine = async_engine
    db_module.AsyncSessionLocal = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    yield async_engine


@pytest.fixture(scope="function")
def async_session_maker(async_engine):
    """
    Initializes the async session maker.
    """
    return async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


@pytest_asyncio.fixture(scope="function")
async def db_session(async_session_maker, db_schema):
    """
    Provides a clean session for each test.
    """
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def db_schema(async_engine):
    """
    Initializes the database schema.
    """
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(name="client")
def client_fixture(db_session):
    """Fixture to override the API database session and disable authentication."""

    def get_session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = get_session_override

    client = AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    yield client

    app.dependency_overrides.clear()
