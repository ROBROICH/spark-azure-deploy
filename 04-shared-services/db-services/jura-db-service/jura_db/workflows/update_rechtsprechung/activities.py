"""Temporal activities for the update_rechtsprechung workflow."""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import select
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from jura_db.cli import process_document
from jura_db.config import app_config
from jura_db.rii_toc import download_toc as download_toc_func
from jura_db.rii_toc import list_toc_items
from jura_db.schemas.db import Document
from jura_db.schemas.temporal import (
    ProcessRechtsprechungInput,
    ProcessRechtsprechungResult,
    RechtsprechungSpec,
)

logger = logging.getLogger("jura_db.workflows.update_rechtsprechung")


def _resolve_toc_path() -> Path:
    """Return the cached TOC path, downloading it if absent."""
    toc_path = Path(app_config.cache_dir) / "rii-toc.xml"
    if toc_path.exists():
        return toc_path
    return download_toc_func(Path(app_config.cache_dir))


def _doc_id_from_link(link: str) -> str:
    return link.split("/")[-1].replace(".zip", "")


class UpdateRechtsprechungActivities:
    """Temporal activities that require database access.

    Instantiate with an ``async_sessionmaker`` and pass ``instance.activity_fns``
    to the worker's activity list. Each activity opens its own session via
    ``async with self._sessionmaker() as session`` so connections are returned
    to the pool even on retry.
    """

    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    @property
    def activity_fns(self) -> list[Callable[..., object]]:
        """Bound activity methods to register with the Temporal worker."""
        return [self._query_existing_doc_ids, self._process_rechtsprechung, self._list_rechtsprechung_activity]

    async def _delete_existing_document(self, doc_id: str, session: AsyncSession) -> None:
        doc = await session.get(Document, doc_id)
        if doc:
            await session.delete(doc)
            await session.commit()
            logger.info(f"Successfully deleted existing document {doc_id}")

    async def _push_to_db(self, document: Document, overwrite: bool) -> None:
        async with self._sessionmaker() as session:
            # Check if document already exists in database
            statement = select(Document).where(Document.doc_id == document.doc_id)
            result = await session.execute(statement)
            db_doc = result.scalar_one_or_none()

            if db_doc is not None:
                if overwrite:
                    logger.info(f"Document {document.doc_id} exists, overwriting...")
                    await self._delete_existing_document(document.doc_id, session)
                else:
                    logger.warning(
                        f"Document {document.doc_id} already exists in database, "
                        "skipping. Use `\"overwrite\": true` to replace."
                    )
                    return

            # Write document to database
            session.add(document)
            await session.commit()

            logger.info(f"Successfully written document {document.doc_id} to database")

    async def _process_document(self, doc_id: str, overwrite: bool) -> Document | None:
        try:
            document = await asyncio.to_thread(process_document, doc_id)
            return document
        except Exception as exc:
            logger.warning(f"Failed to process document {doc_id}: {exc}")
            raise

    @activity.defn(name="list_rechtsprechung")
    async def _list_rechtsprechung_activity(self) -> list[RechtsprechungSpec]:
        toc_path = await asyncio.to_thread(_resolve_toc_path)
        items = await asyncio.to_thread(list_toc_items, toc_path)
        return [RechtsprechungSpec(doc_id=_doc_id_from_link(item["link"])) for item in items]

    @activity.defn(name="query_existing_doc_ids")
    async def _query_existing_doc_ids(self) -> list[str]:
        async with self._sessionmaker() as session:
            result = await session.execute(select(Document.doc_id))
            return [row[0] for row in result.all()]

    @activity.defn(name="process_rechtsprechung")
    async def _process_rechtsprechung(
        self, input: ProcessRechtsprechungInput
    ) -> ProcessRechtsprechungResult:
        if input.spec.doc_id in set(input.existing_doc_ids) and not input.overwrite:
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="duplicate")

        try:
            document: Document | None = await self._process_document(input.spec.doc_id, input.overwrite)
            if document is None:
                raise ValueError(f"Document {input.spec.doc_id} could not be processed.")
        except ValueError as exc:
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="skipped", error=exc.args[0])
        except Exception as exc:
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="failed", error=exc.args[0])

        try:
            await self._push_to_db(document, input.overwrite)
        except Exception as exc:
            logger.warning("failed to write %s: %s", input.spec.doc_id, exc)
            return ProcessRechtsprechungResult(doc_id=input.spec.doc_id, status="failed", error=exc.args[0])

        return ProcessRechtsprechungResult(doc_id=document.doc_id, status="written")


async def list_rechtsprechung() -> list[RechtsprechungSpec]:
    return await workflow.execute_activity(
        UpdateRechtsprechungActivities._list_rechtsprechung_activity,
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=30),
        ),
    )


async def query_existing_doc_ids() -> list[str]:
    return await workflow.execute_activity(
        UpdateRechtsprechungActivities._query_existing_doc_ids,
        start_to_close_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


async def process_rechtsprechung(input_: ProcessRechtsprechungInput) -> ProcessRechtsprechungResult:
    return await workflow.execute_activity(
        UpdateRechtsprechungActivities._process_rechtsprechung,
        input_,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=2),
    )
