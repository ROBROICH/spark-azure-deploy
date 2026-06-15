"""cli unit tests"""

import pytest
from db_pipelines.cli import _get_processor, app
from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.parsers.xml_1 import XmlProcessor1
from db_pipelines.parsers.xml_2.parser import XmlProcessor2
from db_pipelines.schemas.db import Document, DocType
from db_pipelines.schemas.temporal import NormSpec
from db_pipelines.workflows.update_rechtsgrundlage.activities import UpdateRechtsgrundlageActivities
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import select


@pytest.mark.parametrize(
    "parser, hierarchy, bundesland, expected",
    [
        ("XmlProcessor1", Hierarchy.BUND, None, XmlProcessor1),
        ("XmlProcessor1", Hierarchy.BUNDESLAND, Bundesland.NW, XmlProcessor1),
        ("XmlProcessor2", Hierarchy.BUNDESLAND, Bundesland.BY, XmlProcessor2),
    ],
)
def test_get_processor(parser, hierarchy, bundesland, expected):
    """parser selection is driven by the config's ``parser`` field"""
    processor = _get_processor(
        NormSpec(source=hierarchy, bundesland=bundesland, parser=parser, base_url="http://test", slug="test", doctype=DocType.GESETZ)
    )
    assert isinstance(processor, expected)


async def test_write_to_db(db_engine):
    """smoke tests for db inserts via the shared parse_norm write activity"""
    sessionmaker = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)
    activities = UpdateRechtsgrundlageActivities(sessionmaker)

    parser = XmlProcessor1("testG", DocType.GESETZ, base_url="http://test", base_path="tests/data")
    doc = parser.parse_doc()

    await activities._write_document_to_db(doc)

    async with sessionmaker() as session:
        result = (await session.execute(select(Document).where(Document.jurabk == "BTestG"))).all()
        assert len(result) > 0
        assert isinstance(result[0][0], Document)
        assert result[0][0].jurabk == "BTestG"


def test_download_nonexistent(cli_client, respx_mock, caplog):
    """should log an error if the slug does not exist, but keep going"""
    respx_mock.get("http://test.test/foo/xml.zip").mock(return_value=Response(404))
    response = cli_client.invoke(app, ["parse-to-db", "-cf", "tests/data/nonexistant_laws.json"])
    assert response.exit_code == 0
    assert "Could not ingest foo" in caplog.text
    assert "Could not ingest bar" in caplog.text


def test_db_ping(cli_client, base_postgresql):
    """should be able to reach the database"""
    response = cli_client.invoke(app, ["test-db"])
    assert response.exit_code == 0
