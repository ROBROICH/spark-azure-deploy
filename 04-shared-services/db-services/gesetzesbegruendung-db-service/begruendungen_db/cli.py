"""CLI for interacting with dip.bundestag.de"""

import logging
from typing import Any
from pathlib import Path
import json
import asyncio
from pydantic import BaseModel
from sqlalchemy.ext.asyncio.session import AsyncSession, async_sessionmaker

from db_services_shared.models.db.database import init_database, get_async_session_factory  
from db_services_shared.utils.gesetze_normen import GesetzeNormenDB, Hierarchy, BundeslandParam, GNDoc
from begruendungen_db.config import app_config, Source
from begruendungen_db.worker_env import WorkerSettings
from begruendungen_db.parsers.dip_druck import DIPDruckProcessor
from begruendungen_db.schemas.db import Document

import typer

logger = logging.getLogger("begruendungen.cli")
app = typer.Typer()


def get_parser(source: Source, extra: dict[str, Any] | None = None) -> DIPDruckProcessor:
    """returns the parser for a given source"""
    match source:
        case Source.DIP_DRUCK:
            if not extra or "api_key" not in extra:
                raise ValueError("DIP_DRUCK source requires an api_key to be set via the `extra` field")
            extra["docling"] = WorkerSettings().DOCLING.model_dump()
            return DIPDruckProcessor(base_path=app_config.cache_dir, **(extra or {}))
        case _:
            raise ValueError(f"Source {source} is not supported")


class SourceConfig(BaseModel):
    """configuration for a source to parse and write to db"""

    source: Source
    hierarchy: Hierarchy
    bundesland: BundeslandParam | None = None
    extra: dict[str, Any] | None = None
    overwrite: bool = False


async def source_to_db(
    config: SourceConfig,
    gn_client: GesetzeNormenDB,
    session: AsyncSession,
) -> None:
    relevant_laws = gn_client.get_all_docs(config.hierarchy, config.bundesland)
    for law_doc in relevant_laws:
        typer.echo(f"Fetching {law_doc.jurabk}")
        try:
            parser = get_parser(config.source, config.extra)
            directory = parser.fetch_docs(law_doc, overwrite=config.overwrite, **(config.extra or {}))
            if not directory:
                continue
        except Exception as e:
            logger.error(e)
            continue
        for doc_path in parser._get_paths(law_doc.jurabk):
            doc = parser._parse_doc(law_doc.jurabk, doc_path)
            if not doc:
                logger.error(f"Something went wrong parsing the document for {law_doc.jurabk}")
                continue
            logger.info(f"Adding {doc.doknr=} to the database")
            try:
                existing_doc = await session.get(Document, doc.doknr)
                if existing_doc and config.overwrite:
                    if config.overwrite:
                        await session.delete(existing_doc)
                    else:
                        logger.warning(
                            f"skipping entry {doc.doknr=} as it already exists."
                            "set `overwrite=True` to overwrite existing entries in the database"
                        )
                        continue
                await session.merge(doc)
                await session.commit()
            except Exception as e:
                typer.echo(e)
                logger.error(e)


async def _parse_to_db(sources: list[SourceConfig], gn_client: GesetzeNormenDB, session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as session:
        for source_config in sources:
            await source_to_db(source_config, gn_client, session)
        await session.commit()


@app.command()
def parse_to_db(
    config_file: Path = typer.Option("pipeline_config.json", help="json configuration providing a list of `SourceConfig`s"),
) -> None:
    """Download and parse files, write Documents to db"""
    sources: list[SourceConfig] = [SourceConfig(**source) for source in json.loads(config_file.read_text())]
    init_database(app_config)
    session_factory = get_async_session_factory()
    
    gn_client = GesetzeNormenDB(app_config.gesetze_normen_url)

    asyncio.run(_parse_to_db(sources, gn_client, session_factory))


if __name__ == "__main__":
    app()
