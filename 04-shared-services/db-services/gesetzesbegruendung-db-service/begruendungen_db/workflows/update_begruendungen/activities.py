"""Temporal activities for the update_begruendungen workflow."""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from db_services_shared.constants import BundeslandParam, Hierarchy
from db_services_shared.utils.gesetze_normen import GesetzeNormenDB, GNDoc
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from temporal.contracts import (
    GNDocData,
    ProcessLawDocInput,
    ProcessSingleDocInput,
    ProcessSingleDocResult,
)
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from begruendungen_db.cli import get_parser
from begruendungen_db.config import Source, app_config
from begruendungen_db.parsers.base import SkippedDocumentException
from begruendungen_db.schemas.db import Document

logger = logging.getLogger("begruendungen_db.workflows.update_begruendungen")


class UpdateBegruendungenActivities:
    """Temporal activities requiring database or parser access.

    Instantiate with an ``async_sessionmaker`` and pass ``instance.activity_fns``
    to the worker's activity list.
    """

    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    @property
    def activity_fns(self) -> list[Callable[..., object]]:
        return [self._list_law_docs, self._fetch_law_docs, self._process_law_doc]

    @activity.defn(name="list_law_docs")
    async def _list_law_docs(
        self,
        hierarchy: str,
        bundesland: str | None = None,
    ) -> list[GNDocData]:
        """Fetch all GNDocs for a given hierarchy (and optionally bundesland) from gesetze-normen-db."""
        gn_client = GesetzeNormenDB(app_config.gesetze_normen_url)
        docs = await asyncio.to_thread(
            gn_client.get_all_docs,
            Hierarchy(hierarchy),
            BundeslandParam(bundesland) if bundesland else None,
        )
        return [
            GNDocData(
                jurabk=doc.jurabk,
                kurzue=doc.kurzue,
                langue=doc.langue,
                hierarchy=doc.hierarchy,
                bundesland=doc.bundesland,
            )
            for doc in docs
        ]

    @activity.defn(name="fetch_law_docs")
    async def _fetch_law_docs(self, input: ProcessLawDocInput) -> list[dict[str, Any]]:
        """Fetch document metadata for one law_doc from the source."""
        source = Source(input.source.value)
        extra: dict[str, Any] = dict(input.extra or {})
        gn_doc = GNDoc(
            jurabk=input.law_doc.jurabk,
            kurzue=input.law_doc.kurzue,
            langue=input.law_doc.langue,
            hierarchy=Hierarchy(input.law_doc.hierarchy.value),
            bundesland=BundeslandParam(input.law_doc.bundesland.value)
            if input.law_doc.bundesland
            else None,
        )
        parser = get_parser(source, extra)
        try:
            documents = await asyncio.to_thread(parser.fetch_docs, gn_doc, overwrite=input.overwrite, **extra)
        except Exception as exc:
            logger.warning("failed to fetch docs for %s: %s", gn_doc.jurabk, exc)
            raise
        return [doc.model_dump() for doc in documents]

    @activity.defn(name="process_law_doc")
    async def _process_law_doc(self, input: ProcessSingleDocInput) -> ProcessSingleDocResult:
        """Download, parse, and write a single Drucksache document to the database."""
        source = Source(input.source.value)
        extra: dict[str, Any] = dict(input.extra or {})
        gn_doc = GNDoc(
            jurabk=input.law_doc.jurabk,
            kurzue=input.law_doc.kurzue,
            langue=input.law_doc.langue,
            hierarchy=Hierarchy(input.law_doc.hierarchy.value),
            bundesland=BundeslandParam(input.law_doc.bundesland.value)
            if input.law_doc.bundesland
            else None,
        )
        parser = get_parser(source, extra)
        doc_meta = parser.doc_meta_from_dict(input.document_meta.model_dump())

        try:
            doc_path = await asyncio.to_thread(parser._fetch_doc, gn_doc.jurabk, doc_meta)
        except SkippedDocumentException as exc:
            logger.warning("skipping document for %s: %s", gn_doc.jurabk, exc)
            return ProcessSingleDocResult(jurabk=gn_doc.jurabk, status="skipped", error=str(exc))
        except Exception as exc:
            logger.warning("failed to fetch doc for %s: %s", gn_doc.jurabk, exc)
            return ProcessSingleDocResult(jurabk=gn_doc.jurabk, status="failed", error=str(exc))

        try:
            doc: Document = await asyncio.to_thread(parser.parse_doc, gn_doc.jurabk, doc_path)
        except SkippedDocumentException as exc:
            logger.warning("skipping document %s for %s: %s", doc_path, gn_doc.jurabk, exc)
            return ProcessSingleDocResult(jurabk=gn_doc.jurabk, status="skipped", error=str(exc))
        except Exception as exc:
            logger.warning("failed to parse %s: %s", doc_path, exc)
            return ProcessSingleDocResult(jurabk=gn_doc.jurabk, status="failed", error=str(exc))

        async with self._sessionmaker() as session:
            try:
                existing = await session.get(Document, doc.doknr)
                if existing and not input.overwrite:
                    result = ProcessSingleDocResult(
                        jurabk=gn_doc.jurabk,
                        status="skipped",
                        error="duplicate doknr",
                    )
                else:
                    await session.merge(doc)
                    await session.commit()
                    result = ProcessSingleDocResult(
                        jurabk=gn_doc.jurabk,
                        status="written",
                        error=None,
                    )
            except Exception as exc:
                logger.warning("failed to write doknr=%s: %s", doc.doknr, exc)
                await session.rollback()
                result = ProcessSingleDocResult(
                    jurabk=gn_doc.jurabk,
                    status="failed",
                    error=str(exc),
                )
            return result


async def list_law_docs(hierarchy: str, bundesland: str | None = None) -> list[GNDocData]:
    return await workflow.execute_activity(
        UpdateBegruendungenActivities._list_law_docs,
        args=[hierarchy, bundesland],
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=30),
        ),
    )


async def fetch_law_docs(input_: ProcessLawDocInput) -> list[dict[str, Any]]:
    return await workflow.execute_activity(
        UpdateBegruendungenActivities._fetch_law_docs,
        args=[input_],
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=30),
        ),
    )


async def process_law_doc(input_: ProcessSingleDocInput) -> ProcessSingleDocResult:
    return await workflow.execute_activity(
        UpdateBegruendungenActivities._process_law_doc,
        args=[input_],
        # docling PDF conversion + embedding generation can be slow
        # for long documents
        start_to_close_timeout=timedelta(hours=4),
        retry_policy=RetryPolicy(maximum_attempts=1),
    )
