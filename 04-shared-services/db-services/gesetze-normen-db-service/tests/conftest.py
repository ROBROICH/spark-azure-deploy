"""pytest fixture definitions"""

import asyncio
import json
from pathlib import Path

import defusedxml.ElementTree as ET
import pytest
from db_pipelines.config import app_config
from db_pipelines.constants import Hierarchy
from db_pipelines.parsers.xml_1 import XmlProcessor1
from db_pipelines.schemas.db import DocType, Document, Legaldefinition, ParagraphTyp, TechnischeNorm
from db_pipelines.schemas.db import Norm as DBNorm
from db_pipelines.service import app
from db_services_shared.models.db.database import get_db_session
from db_services_shared.models.db.migrate import run_alembic_downgrade, run_alembic_upgrade
from db_services_shared.testing.postgres import (
    external_postgres_server,
    use_external_postgres,
)
from db_services_shared.utils.parsing import split_paragraph_nr_str
from fastapi.testclient import TestClient
from pytest_postgresql import factories
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typer.testing import CliRunner

# Use an already-running PostgreSQL if PYTEST_POSTGRES_EXTERNAL is set.
if use_external_postgres():
    postgresql_noproc = external_postgres_server()
    postgresql = factories.postgresql("postgresql_noproc")


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


async def add_norm_sequence(jurabk: str, doknr: str, paragraph_nrs: list[str], db_session):
    """Seed one document whose norms are exactly `paragraph_nrs`.

    Built directly rather than through an XML fixture so a neighbour layout can
    be stated precisely in the test that needs it.
    """
    document = Document(
        doknr=doknr,
        doktyp=DocType.GESETZ,
        hierarchy=Hierarchy.BUND,
        builddate="20260101000000",
        jurabk=jurabk,
        langue=f"{jurabk} Langtitel",
        kurzue=f"{jurabk} Kurztitel",
        fundstelle="BGBl I 2026, 1",
        normen=[
            DBNorm(
                jurabk=jurabk,
                paragraph_nr=numeric,
                sub_paragraph_nr=alpha,
                paragraph_typ=ParagraphTyp.SINGLE,
                titel=f"§ {paragraph_nr} Titel",
                paragraph_text=f"Text von § {paragraph_nr}",
            )
            for paragraph_nr, (numeric, alpha) in (
                (nr, split_paragraph_nr_str(nr)) for nr in paragraph_nrs
            )
        ],
    )
    db_session.add(document)
    await db_session.commit()


@pytest.fixture
def api_client_neighbours(db_engine):
    """API client seeded with a law whose paragraphs are §§ 1, 2, 3, 4, 4a, 5.

    Kept separate from `api_client` so the existing fixtures - and the counts
    asserted against them - stay untouched.
    """

    async def _seed() -> None:
        factory = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            await add_norm_sequence(
                "NachbarG",
                "BJNRNACHBAR",
                ["1", "2", "3", "4", "4a", "5"],
                session,
            )
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
