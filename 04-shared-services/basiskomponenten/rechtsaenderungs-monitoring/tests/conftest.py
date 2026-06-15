"""pytest fixture defintions"""

# flake8: noqa

from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock
from fastapi import FastAPI
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, async_sessionmaker, create_async_engine

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient, Response
from respx.router import MockRouter
from rechtsaenderungsmonitoring.parser.bgbl import BGBLParser
from rechtsaenderungsmonitoring.parser import get_parser
from rechtsaenderungsmonitoring.service import app
from rechtsaenderungsmonitoring.schemas.db import Document, Norm

from db_services_shared.constants import Bundesland
from db_services_shared.models.db.database import get_db_session
from db_services_shared.models.db.migrate import run_alembic_upgrade, run_alembic_downgrade

from tests.data.test_doc import _TEST_NORM, _TEST_DOCUMENT


@pytest.fixture(autouse=True)
def test_config(monkeypatch):
    monkeypatch.setenv("CACHE_DIR", "tests/data")
    monkeypatch.setenv("LLM_CATEGORISATION_MODEL", "test-4b")
    monkeypatch.setenv("LLM_SUMMARISATION_MODEL", "test-120b")
    monkeypatch.setenv("LLM_ENRICHMENT_MODEL", "test-120b")


@pytest.fixture
def base_postgresql(postgresql):
    """base postgresql fixture for sync and async engines to use"""
    run_alembic_upgrade()
    yield postgresql
    run_alembic_downgrade()


@pytest.fixture
# pyrefly: ignore [implicit-any-parameter]
# base_postgresql runs migrations
def db_engine(base_postgresql) -> Generator[AsyncEngine, None]:
    """Create async engine pointing at the test database, with migrations applied."""
    from rechtsaenderungsmonitoring.config import app_config

    engine = create_async_engine(app_config.db.async_dsn, echo=False)
    yield engine


@pytest.fixture
def mock_feed(respx_mock):
    """mocked rss feed (from local testdata)"""
    xml_file_path = "tests/data/test-feed.xml"
    with open(xml_file_path, "rb") as f:
        xml_content = f.read()
    mock_route = respx_mock.get(BGBLParser._feed_url).mock(return_value=Response(200, content=xml_content))
    return mock_route


@pytest.fixture
def mock_feed_bayern(respx_mock):
    """mocked empty state rss feed (for fastapi initialisation)"""
    mock_route = respx_mock.get(get_parser(Bundesland.BY)._feed_url).mock(return_value=Response(200, content=b""))
    return mock_route


@pytest.fixture
async def fastapi_app(
    db_engine: AsyncEngine, respx_mock: MockRouter, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[FastAPI, None]:
    """app fixture with LifespanManager; BGBLParser feed endpoint is mocked via respx.

    The lifespan connects to Temporal and ensures the schedule on startup; both are
    mocked so the app can start without a running Temporal server.
    """
    monkeypatch.setattr("rechtsaenderungsmonitoring.service.get_temporal_client", AsyncMock())
    monkeypatch.setattr("rechtsaenderungsmonitoring.service.ensure_rechtsaenderungen_schedule", AsyncMock())

    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        affected_norm = Norm.model_validate(_TEST_NORM)
        session.add(Document.model_validate({**_TEST_DOCUMENT, "affected_norms": [affected_norm]}))
        session.add(affected_norm)
        await session.commit()

    async def get_session_override() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    respx_mock.get(BGBLParser._feed_url).mock(return_value=Response(200, content=b""))

    app.dependency_overrides[get_db_session] = get_session_override
    async with LifespanManager(app) as manager:
        yield manager.app
    app.dependency_overrides.clear()


@pytest.fixture
async def api_client(fastapi_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """api test client"""
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as ac:
        yield ac
