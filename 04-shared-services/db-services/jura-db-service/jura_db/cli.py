"""CLI utilities for jura_db download pipeline"""

import typer
from pathlib import Path
from typing_extensions import Annotated
import logging
import typer
import httpx
from httpx import HTTPError, HTTPStatusError

from db_services_shared.utils.zip import extract_and_validate

from sqlalchemy import Engine
from sqlmodel import Session, create_engine, select
from sqlmodel.pool import StaticPool

from jura_db.rii_toc import get_toc_item, download_toc as download_toc_func

# Import the parser and database models
from jura_db.rii_parser import parse_doc
from jura_db.schemas.db import Document
from jura_db.config import app_config

logger = logging.getLogger("cli")

app = typer.Typer()


def get_document_info_by_name(document_name: str) -> dict[str, str]:
    """Get document info directly from document name without TOC"""
    # Construct the direct download link
    base_url = app_config.rii_base_document_url
    link = f"{base_url}/{document_name}.zip"

    return {
        "gericht": "Unknown",  # We don't have this info without TOC
        "entsch_datum": "Unknown",
        "aktenzeichen": document_name,
        "link": link,
        "modified": "Unknown",
    }


def download_document(link: str, output_dir: Path) -> Path:
    """Download document from link and save to output directory"""
    try:
        # Create output directory if it doesn't exist
        output_dir.mkdir(parents=True, exist_ok=True)

        filename = Path(link.split("/")[-1]).name
        if not filename or filename in {".", ".."}:
            raise ValueError(f"Could not derive a valid filename from link: {link}")
        output_path = output_dir / filename

        logger.info(f"Downloading {filename}...")
        response = httpx.get(link)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(response.content)

        logger.info(f"Downloaded {filename} successfully")
        return output_path

    except Exception as e:
        logger.error(f"Failed to download {link}: {e}")
        raise


def extract_document(zip_path: Path, output_dir: Path) -> Path:
    """Extract the downloaded document"""
    try:
        # Extract the zip file
        extract_and_validate(zip_path, output_dir)

        logger.info(f"Extracted {zip_path.name} to {output_dir}")

        # Clean up the zip file
        zip_path.unlink()
        logger.info(f"Cleaned up zip file: {zip_path.name}")

        return output_dir

    except Exception as e:
        logger.error(f"Failed to extract {zip_path}: {e}")
        raise


def delete_existing_document(doc_id: str, session: Session) -> None:
    """Delete existing document and all related data from database"""
    logger.info(f"Deleting existing document {doc_id} and related data...")

    doc = session.exec(select(Document).where(Document.doc_id == doc_id)).first()
    session.delete(doc)

    session.commit()
    logger.info(f"Successfully deleted existing document {doc_id}")


def push_to_db(document: Document, engine: Engine, overwrite: bool = False) -> None:
    """Parse document and push to database"""
    try:
        with Session(engine) as session:
            # Check if document already exists in database
            statement = select(Document).where(Document.doc_id == document.doc_id)
            db_doc = session.exec(statement).first()

            if db_doc is not None:
                if overwrite:
                    logger.info(f"Document {document.doc_id} exists, overwriting...")
                    delete_existing_document(document.doc_id, session)
                else:
                    logger.warning(
                        f"Document {document.doc_id} already exists in database, "
                        "skipping. Use --overwrite to replace."
                    )
                    return

            # Write document to database
            session.add(document)
            session.commit()

            logger.info(f"Successfully written document {document.doc_id} to database")

    except Exception as e:
        logger.error(f"Failed to write decision to database", exc_info=True)
        raise e


def _resolve_toc_path() -> Path:
    """Resolve a TOC path by fetching or using an existing local file."""
    try:
        if (Path(app_config.cache_dir) / "rii-toc.xml").exists():
            return Path(app_config.cache_dir) / "rii-toc.xml"
        else:
            return download_toc_func(Path(app_config.cache_dir))
    except Exception as e:
        logger.error(f"Unable to obtain TOC: {e}")
        raise


def process_document(document_identifier: str, overwrite: bool = False) -> Document | None:
    """Main function that orchestrates the entire process"""
    try:
        # Determine if we're using document number or document name
        if document_identifier.isdigit():
            # Mode 1: Document number from TOC
            document_number = int(document_identifier)
            logger.info(f"Processing document number {document_number}")
            logger.info("Step 1: Obtaining TOC file...")
            toc_path = _resolve_toc_path()
            document_info = get_toc_item(toc_path, document_number)
            doc_id = document_info["link"].split("/")[-1].replace(".zip", "")
        else:
            # Mode 2: Direct document name
            logger.info(f"Processing document by name: {document_identifier}")
            logger.info("Step 1: Getting document info from name...")
            document_info = get_document_info_by_name(document_identifier)
            doc_id = document_info["link"].split("/")[-1].replace(".zip", "")

        logger.info(
            f"Document: {document_info['gericht']} - {document_info['aktenzeichen']}"
            f"({document_info['entsch_datum']})"
        )

        output_dir = Path(app_config.cache_dir) / doc_id
        # Step 2: Download document
        logger.info("Step 2: Downloading document...")
        try:
            zip_path = download_document(document_info["link"], output_dir)
        except HTTPStatusError as e:
            logger.error(f"could not fetch {document_info['link']} ({e.response.status_code}), skipping.")
            raise e

        # Step 3: Extract document
        logger.info("Step 3: Extracting document...")
        decision_dir = extract_document(zip_path, output_dir)

        # Find the XML file in the directory
        xml_files = list(decision_dir.glob("*.xml"))
        if len(xml_files) == 0:
            raise ValueError(f"No XML files found in {decision_dir}")
        if len(xml_files) > 1:
            logger.warning(
                f"Multiple XML files found in {decision_dir}, using the first one"
            )

        xml_file = xml_files[0]
        logger.info(f"Parsing XML file: {xml_file}")

        # Parse the document
        document = parse_doc(xml_file)
        return document

    except HTTPError as e:
        raise e
    except IndexError as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to process document: {document_identifier}", exc_info=True)
        raise e


@app.command()
def download_toc(overwrite: bool = False) -> None:
    """Download the TOC XML to the cached folder."""
    try:
        toc_path = download_toc_func(Path(app_config.cache_dir), overwrite=overwrite)
        typer.echo(f"TOC downloaded successfully to: {toc_path}")
    except Exception as e:
        typer.echo(f"Failed to download TOC: {e}")
        raise typer.Exit(1)


@app.command()
def main(
    document_identifier: Annotated[
        str,
        typer.Argument(
            help="Document number (0-based TOC index) \
            or document name (e.g., jb-JURE100055033)"
        ),
    ],
    overwrite: Annotated[
        bool, typer.Option(help="Replace existing document with fresh parsing")
    ] = False,
) -> None:
    """
    Download, parse, and save a court decision to the database.

    This command supports two modes:

    Mode 1 (Document Number): Pass a number (0-based index) to process
    from TOC file.

    Mode 2 (Document Name): Pass a document name (e.g., jb-JURE100055033)
    to download directly.

    The command performs all steps in sequence:
    1. Read TOC file or get document info from name
    2. Download the document
    3. Extract and parse the document
    4. Save to database

    Examples:
        # Process document by name
        python -m jura_db.cli jb-JURE100055033

        # Process document by TOC index
        python -m jura_db.cli 0

        # Overwrite existing document
        python -m jura_db.cli jb-JURE100055033 --overwrite
    """
    # Create database engine
    engine = create_engine(str(app_config.db.dsn), poolclass=StaticPool)

    doc = process_document(document_identifier, overwrite)

    if doc:
        logger.info("writing to database...")
        push_to_db(doc, engine, overwrite)
    else:
        logger.error("could not process document")

    typer.echo("\n Document processing completed successfully")


@app.command()
def download_all(overwrite: bool = False) -> None:
    """single function to download all docs, because port-forwarding crashes when we close connection"""
    import time
    start = time.time()
    # Create database engine
    engine = create_engine(str(app_config.db.dsn), poolclass=StaticPool)

    i = 0
    while True:
        try:
            doc = process_document(str(i))
            if doc is not None:
                push_to_db(doc, engine, overwrite)
                typer.echo(f"written {doc.doc_id}")
            else:
                typer.echo(f"could not process document {i}")
            i += 1
        except IndexError:
            typer.echo(f"no more documents ({i - 1} processed)!")
            elapsed = time.time() - start
            typer.echo(f"Elapsed time: {elapsed/60:.2f} minutes")
            return
        except Exception as e:
            elapsed = time.time() - start
            typer.echo(f"Elapsed time: {elapsed/60:.2f} minutes")
            raise e


if __name__ == "__main__":
    app()
