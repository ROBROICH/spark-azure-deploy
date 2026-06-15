"""pytest fixture definitions"""

import asyncio
import json
from pathlib import Path

import defusedxml.ElementTree as ET
import pytest
from db_pipelines.config import app_config
from db_pipelines.constants import Hierarchy
from db_pipelines.parsers.xml_1 import XmlProcessor1
from db_pipelines.schemas.db import DocType, Legaldefinition, TechnischeNorm
from db_pipelines.service import app
from db_services_shared.models.db.database import get_db_session
from db_services_shared.models.db.migrate import run_alembic_downgrade, run_alembic_upgrade
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typer.testing import CliRunner


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


async def add_data(xml_path: str, source: Hierarchy, doctype: DocType, db_session):
    """helper for populating db with test data from xml"""
    ET.parse(xml_path)
    if source == Hierarchy.BUND:
        slug = xml_path.split("/")[-2]
        parser = XmlProcessor1(slug, doctype, base_url="http://test.test", base_path="tests/data")
        doc = parser.parse_doc()
        db_session.add(doc)
        await db_session.commit()
    else:
        raise ValueError(f"source {source} not configured")  # noqa: B904


async def add_legaldefinitionen(json_path: str, db_session):
    """helper for populating legaldefinitionen table from a json fixture"""
    with Path(json_path).open(encoding="utf-8") as fh:
        entries = json.load(fh)
    for entry in entries:
        db_session.add(Legaldefinition(**entry))
    await db_session.commit()


async def add_technische_normen(json_path: str, db_session):
    """helper for populating technische_normen table from a json fixture"""
    with Path(json_path).open(encoding="utf-8") as fh:
        entries = json.load(fh)
    for entry in entries:
        db_session.add(TechnischeNorm(**entry))
    await db_session.commit()


@pytest.fixture
def api_client(db_engine):
    """api test client"""

    async def _seed() -> None:
        factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            await add_data("tests/data/xml_processor_1/BUND/testG/test.xml", Hierarchy.BUND, DocType.GESETZ, session)
            await add_data("tests/data/xml_processor_1/BUND/test2G/test2.xml", Hierarchy.BUND, DocType.GESETZ, session)
            await add_legaldefinitionen("tests/data/legaldefinitionen/seed.json", session)
            await add_technische_normen("tests/data/technische_normen/seed.json", session)
        # dispose pool so seeding-loop connections don't bleed into TestClient's loop
        await db_engine.dispose()

    asyncio.run(_seed())

    async def get_session_override():
        async with async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)() as session:
            yield session

    app.dependency_overrides[get_db_session] = get_session_override

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def cli_client(base_postgresql):
    """cli test client"""
    yield CliRunner()
