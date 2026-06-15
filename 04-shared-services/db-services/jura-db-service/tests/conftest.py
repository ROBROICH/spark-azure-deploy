"""pytest fixture definitions"""

import pytest
from pathlib import Path
from pytest_postgresql import factories
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from pydantic import HttpUrl
from sqlmodel import select

import pytest
from db_services_shared.llm.embeddings import LLMProvider
from db_services_shared.models.db.database import get_db_session
from db_services_shared.models.db.migrate import run_alembic_downgrade, run_alembic_upgrade
from jura_db.service import app
from jura_db.config import app_config
from jura_db.rii_parser import parse_doc
from jura_db.schemas.db import Chunk, Document
from fastapi.testclient import TestClient
from typer.testing import CliRunner


@pytest.fixture(autouse=True)
def test_config(monkeypatch):
    monkeypatch.setattr(app_config, "cache_dir", Path("tests/data"))
    monkeypatch.setattr(app_config.chunking, "apikey", "test")
    monkeypatch.setattr(app_config.chunking, "provider", LLMProvider.TEST)
    monkeypatch.setattr(app_config.chunking, "url", HttpUrl("http://test"))


@pytest.fixture
def db_engine(postgresql):
    """Create async engine pointing at the test database, with migrations applied."""
    run_alembic_upgrade()

    engine = create_async_engine(str(app_config.db.async_dsn), echo=False)
    yield engine

    run_alembic_downgrade()


@pytest.fixture
def db_session(db_engine):
    """Standalone async session for non-API tests (e.g. CLI tests)."""
    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    import asyncio
    loop = asyncio.new_event_loop()
    session = loop.run_until_complete(factory().__aenter__())
    yield session
    loop.run_until_complete(session.__aexit__(None, None, None))
    loop.close()

@pytest.fixture
def mock_query_embedding(monkeypatch):
    """Mock the query embedding function to return a fixed vector"""
    monkeypatch.setattr(
        "db_services_shared.llm.embeddings.EmbeddingClient.embed_query", 
        lambda _, text: [0.1] * app_config.chunking.dimensions
    )
    monkeypatch.setattr(
        "db_services_shared.llm.embeddings.EmbeddingClient.embed_documents", 
        lambda _, texts: [[0.1] * app_config.chunking.dimensions for _ in texts]
    )

@pytest.fixture
def sample_document(mock_query_embedding):
    """Create a sample document from XML"""
    xml_file = Path("tests/data") / "jb-TESTDOC0001" / "jb-TESTDOC0001.xml"
    doc = parse_doc(xml_file)
    example_chunk = {
        "text": "test_chunk_1",
        "section_text": "test_chunk_1test_chunk_2_continued",
        "embedding": [0.1] * app_config.chunking.dimensions,
        "section_title": "test_section",
        "section_number": "7",
        "chunk_index": 0,
        "start_char": 0,
        "end_char": 11,
        "section_length": 11,
        "is_complete_section": False,
        "is_part_of": None
    }
    # add split chunk for testing
    test_chunk = Chunk(**example_chunk)
    test_chunk
    doc.chunks.append(
        test_chunk
    )
    # create a new chunk from init rather than model_copy
    # because orm doesn't like the latter!
    test_chunk_continued = Chunk(
        **test_chunk.model_copy(
            update={
            "text": "test_chunk_2_continued",
            "chunk_index": 1,
            "start_char": 11,
            "end_char": 28,
            "section_length": 28,
            "embedding": [0.8] * (app_config.chunking.dimensions // 2)
             + [0.1] * (app_config.chunking.dimensions - app_config.chunking.dimensions // 2),
            },
        ).model_dump(exclude={"id", "doc_id"})
    )
    doc.chunks.append(
        test_chunk_continued
    )
    return doc


@pytest.fixture
def api_client(db_engine, sample_document):
    """API test client. Creates sessions on TestClient's event loop to avoid cross-loop issues."""
    factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    async def get_session_override():
        async with factory() as session:
            # Add test data if database is empty
            result = await session.execute(select(Document))
            if len(result.scalars().all()) == 0:
                session.add(sample_document)
                await session.commit()
            yield session

    app.dependency_overrides[get_db_session] = get_session_override

    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def cli_client(db_session):
    """cli test client"""
    yield CliRunner()
