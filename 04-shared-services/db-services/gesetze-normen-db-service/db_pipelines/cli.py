"""cli tool"""

import asyncio
import csv
import json
import logging
from pathlib import Path
from typing import Annotated, Any

import typer
from db_services_shared.models.db.database import (
    get_async_session_factory,
    init_database,
)
from sqlmodel import Session, create_engine, func, select, text
from sqlalchemy import Engine
from sqlmodel.pool import StaticPool

from db_pipelines.config import PipelineConfig, app_config
from db_pipelines.constants import Hierarchy
from db_pipelines.norm_specs import collect_norm_specs
from db_pipelines.schemas.db import DocType, Legaldefinition, TechnischeNorm
from db_pipelines.schemas.temporal import NormSpec, ParseNormInput
from db_pipelines.workflows.update_rechtsgrundlage.activities import (
    UpdateRechtsgrundlageActivities,
    _get_processor,
)

logger = logging.getLogger("cli")
logger.setLevel(logging.INFO)

app = typer.Typer()


@app.command()
def download_law(
    source: Annotated[Hierarchy, typer.Argument(help="the document provider")],
    parser_class: Annotated[str, typer.Argument(help="the parser class to use for this document")],
    base_url: Annotated[str, typer.Argument(help="the base url for fetching the documents, used by the parser")],
    slug: Annotated[str, typer.Argument(help="the url shortform of the law.")],
    doctype: Annotated[DocType, typer.Argument(help="type of document")],
) -> None:
    """
    downloads files for a law slug to the local `CACHE_DIR` directory.

    Args:
      slug (str): the url shortform of the law.
    """
    parser = _get_processor(NormSpec(source=source, parser=parser_class, base_url=base_url, slug=slug, doctype=doctype))
    parser.fetch_doc()


@app.command()
def parse_to_db(
    config_file: Annotated[
        Path,
        typer.Option(
            "--config-file",
            "-cf",
            help="config file with relevant laws (see app_config.PipelineConfig)",
        ),
    ],
    overwrite: Annotated[
        bool,
        typer.Option("--overwrite", help="wether to overwrite rows if they exist in the db"),
    ] = False,
):
    """
    download and parse xmls|htmls from different sources into python objects
    and save them in the database.

    Reuses the Temporal ``parse_norm`` activity (fetch + parse + archive +
    write) so the CLI and the worker share a single ingestion code path.
    """
    init_database(app_config)
    activities = UpdateRechtsgrundlageActivities(get_async_session_factory())
    specs = collect_norm_specs(PipelineConfig(json_location=config_file).relevant_laws)

    async def _run() -> None:
        for spec in specs:
            typer.echo(f"fetching {spec.slug} ({spec.doctype})")
            try:
                result = await activities._parse_norm(
                    ParseNormInput(spec=spec, overwrite=overwrite)
                )
                typer.echo(f"{result.status} {spec.slug} -> {result.jurabk}\n---")
            except Exception as e:
                typer.secho(
                    f"ERROR: Could not ingest {spec.slug} ({spec.doctype}): {type(e).__name__}",
                    fg=typer.colors.RED,
                )
                logger.warning(f"Could not ingest {spec.slug}: {e}")
                continue

    asyncio.run(_run())

    typer.echo("-----")
    typer.echo("done writing all tables")


def _upsert_legaldefinitionen(
    engine: Engine,
    entries: list[dict[str, Any]],
    truncate: bool = False,
) -> tuple[int, int, int]:
    """Insert or update legal definitions based on the natural key jurabk + begriff."""
    inserted = 0
    updated = 0

    with Session(engine) as session:
        if truncate:
            session.exec(text("DELETE FROM legaldefinitionen"))
            session.commit()

        for entry in entries:
            existing = session.exec(
                select(Legaldefinition).where(
                    Legaldefinition.jurabk == entry["jurabk"],
                    Legaldefinition.begriff == entry["begriff"],
                )
            ).first()

            if existing is None:
                session.add(Legaldefinition(**entry))
                inserted += 1
                continue

            existing.paragraph_nr = entry["paragraph_nr"]
            existing.titel = entry["titel"]
            existing.definition = entry["definition"]
            updated += 1

        session.commit()
        total = session.exec(select(func.count()).select_from(Legaldefinition)).one()

    return inserted, updated, total

@app.command()
def import_legaldefinitionen(
    data_path: Annotated[
        Path,
        typer.Argument(
            help="Path to the JSON file produced by the legal definitions extraction workflow",
        ),
    ],
    truncate: Annotated[
        bool,
        typer.Option(
            "--truncate",
            help="Delete existing rows from legaldefinitionen before importing the file",
        ),
    ] = False,
):
    """Import extracted legal definitions JSON into the gesetze-normen database."""
    with data_path.open(encoding="utf-8") as file_handle:
        entries = json.load(file_handle)

    if not isinstance(entries, list):
        raise typer.BadParameter("Expected a top-level JSON list of legaldefinition entries.")

    engine: Engine = create_engine(app_config.db.dsn, poolclass=StaticPool)
    inserted, updated, total = _upsert_legaldefinitionen(engine, entries, truncate=truncate)

    typer.echo(f"inserted: {inserted}")
    typer.echo(f"updated: {updated}")
    typer.echo(f"total rows: {total}")


def _upsert_technische_normen(
    engine: Engine,
    entries: list[dict[str, Any]],
    truncate: bool = False,
) -> tuple[int, int, int]:
    """Insert or update technische Normen based on the natural key dokument."""
    inserted = 0
    updated = 0

    with Session(engine) as session:
        if truncate:
            session.exec(text("DELETE FROM technische_normen"))
            session.commit()

        for entry in entries:
            existing = session.exec(
                select(TechnischeNorm).where(TechnischeNorm.dokument == entry["dokument"])
            ).first()

            if existing is None:
                session.add(TechnischeNorm(**entry))
                inserted += 1
                continue

            existing.titel_de = entry["titel_de"]
            existing.titel_en = entry["titel_en"]
            existing.kurzbeschreibung = entry["kurzbeschreibung"]
            updated += 1

        session.commit()
        total = session.exec(select(func.count()).select_from(TechnischeNorm)).one()

    return inserted, updated, total


@app.command()
def import_technische_normen(
    data_path: Annotated[
        Path,
        typer.Argument(
            help="Path to the CSV file with technische Normen (semicolon-separated)",
        ),
    ],
    truncate: Annotated[
        bool,
        typer.Option(
            "--truncate",
            help="Delete existing rows from technische_normen before importing",
        ),
    ] = False,
):
    """Import technische Normen from the reference CSV into the gesetze-normen database.

    Expected columns (semicolon-separated): Veröffentlichungsform; Dokument; Titel (deutsch);
    Titel (englisch); Ausgabedatum; ...; Kurzbeschreibung (column 8).
    """
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()

    with data_path.open(encoding="utf-8") as fh:
        reader = csv.reader(fh, delimiter=";")
        next(reader)  # skip header
        for row in reader:
            if len(row) < 8:
                continue
            dokument = row[1].strip()
            if not dokument or dokument in seen:
                continue
            seen.add(dokument)
            entries.append(
                {
                    "dokument": dokument,
                    "titel_de": row[2].strip(),
                    "titel_en": row[3].strip(),
                    "kurzbeschreibung": row[7].strip(),
                }
            )

    engine: Engine = create_engine(app_config.db.dsn, poolclass=StaticPool)
    inserted, updated, total = _upsert_technische_normen(engine, entries, truncate=truncate)

    typer.echo(f"inserted: {inserted}")
    typer.echo(f"updated: {updated}")
    typer.echo(f"total rows: {total}")


@app.command()
def test_db() -> None:
    """tests the db connection (for local development and env setup)"""
    engine: Engine = create_engine(app_config.db.dsn, poolclass=StaticPool)
    typer.echo(
        f"connecting to \
        {app_config.db.user}@{app_config.db.host}:{app_config.db.port}/{app_config.db.name}"
    )
    with Session(engine) as session:
        typer.echo(session.exec(select(text("'success'"))).first())



if __name__ == "__main__":
    app()
