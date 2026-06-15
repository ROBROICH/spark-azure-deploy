"""pytest fixture defintions"""

from typing import AsyncGenerator
from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from begruendungen_db.config import Source, app_config
from begruendungen_db.parsers.base import SkippedDocumentException
from begruendungen_db.parsers.dip_druck import DIPDruckProcessor
from begruendungen_db.service import app
from db_services_shared.models.db.database import get_db_session
from db_services_shared.models.db.migrate import run_alembic_downgrade, run_alembic_upgrade
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typer.testing import CliRunner


@pytest.fixture(autouse=True)
def test_config(monkeypatch):
    monkeypatch.setattr("begruendungen_db.config.app_config.cache_dir", "tests/data/complete")
    monkeypatch.setattr("begruendungen_db.config.app_config.chunking.provider", "test")
    monkeypatch.setattr("begruendungen_db.config.app_config.chunking.apikey", "test")
    monkeypatch.setattr("begruendungen_db.config.app_config.chunking.url", "http://testclient")


@pytest.fixture
def base_postgresql(postgresql):
    """base postgresql fixture for sync and async engines to use"""
    run_alembic_upgrade()
    yield postgresql
    run_alembic_downgrade()

@pytest.fixture
def db_engine(base_postgresql):
    """Create async engine pointing at the test database, with migrations applied."""
    engine = create_async_engine(str(app_config.db.async_dsn), echo=False)
    yield engine

@pytest.fixture
async def db_session(db_engine):
    """Session for SQLAlchemy."""
    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        yield session


@pytest.fixture
def mock_query_embedding(monkeypatch):
    """Mock the query embedding function to return a fixed vector"""
    monkeypatch.setattr(
        "db_services_shared.llm.embeddings.EmbeddingClient.embed_query",
        lambda _, text: [0.1] * app_config.chunking.dimensions,
    )
    monkeypatch.setattr(
        "db_services_shared.llm.embeddings.EmbeddingClient.encode_documents",
        lambda _, texts: [[0.1] * app_config.chunking.dimensions for _ in texts],
    )


async def add_data(source, db_session: AsyncSession) -> None:
    """helper for populating the database for testing api"""
    if source == Source.DIP_DRUCK:
        path = Path("./tests/data/complete")
        parser = DIPDruckProcessor(
            base_path=path,
            api_key="test",
            docling={"HOST": "http://localhost", "TOKEN_URL": None},
        )
        for law_dir in filter(Path.is_dir, path.iterdir()):
            law = law_dir.name
            for file in filter(lambda f: f.is_file() and f.suffix == ".json", law_dir.iterdir()):
                try:
                    sql_doc = parser.parse_doc(law, file)
                except SkippedDocumentException:
                    continue
                await db_session.merge(sql_doc)
                await db_session.commit()


@pytest.fixture
async def fastapi_app(db_engine, monkeypatch):
    """app fixture with lifespan manager"""
    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _seed() -> None:
        async with factory() as db_session:
            await add_data(Source.DIP_DRUCK, db_session)

    await _seed()

    async def get_session_override() -> AsyncGenerator[AsyncSession, None]:
        """helper function"""
        async with factory() as db_session:
            yield db_session

    app.dependency_overrides[get_db_session] = get_session_override
    async with LifespanManager(app) as manager:
        yield manager.app
    app.dependency_overrides.clear()


@pytest.fixture
async def api_client(fastapi_app):
    """api test client"""
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def cli_client(base_postgresql):
    """cli test client"""
    yield CliRunner()
