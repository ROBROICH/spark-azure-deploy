"""Temporal activities for the update_rechtsgrundlage workflow."""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload, subqueryload
from sqlmodel import select
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers import parser_map
from db_pipelines.schemas.db import (
    Document, Norm, Absatz, DocumentHistory
)
from db_pipelines.schemas.temporal import (
    NormSpec,
    ParseNormInput,
    ParseNormResult,
)

logger = logging.getLogger("db_pipelines.workflows.update_rechtsgrundlage")


def _get_processor(spec: NormSpec) -> BaseProcessor:
    """Return the processor for a given norm based on its source.

    Shared by the download and parse activities so the parser-selection logic
    lives in exactly one place.
    """
    processor_class = parser_map.get(spec.parser)
    if processor_class is None:
        raise ValueError(f"no processor found for parser name {spec.parser}")
    return processor_class(
        slug=spec.slug,
        doctype=spec.doctype,
        hierarchy=spec.source,
        base_url=spec.base_url,
        bundesland=spec.bundesland,
        **spec.extra
    )


class ExistingException(Exception):
    pass


class UpdateRechtsgrundlageActivities:
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
        return [self._query_existing_norms, self._parse_norm]

    @activity.defn(name="query_existing_norms")
    async def _query_existing_norms(self) -> list[str]:
        async with self._sessionmaker() as session:
            result = await session.execute(select(Document.jurabk))
            return [row[0] for row in result.all()]

    async def _load_full_document(self, jurabk: str, session: AsyncSession) -> Document:
        """Loads a document with all relationships for the given jurabk."""
        result = await session.execute(
            select(Document)
            .where(Document.jurabk == jurabk)
            .options(
                selectinload(Document.standangaben),
                selectinload(Document.anlagen),
                selectinload(Document.toc),
                subqueryload(Document.normen)
                .subqueryload(Norm.absaetze)
                .subqueryload(Absatz.saetze)
            )
        )
        return result.scalar_one()

    async def _archive_document(self, existing: Document, session: AsyncSession) -> str:
        """archives a document and returns the version string for the new history entry"""
        # reload relationships because session is async and _to_json is sync
        existing_full = await self._load_full_document(existing.jurabk, session)
        doc = DocumentHistory.from_document(existing_full)
        try:
            session.add(doc)
            await session.delete(existing)
            # flush to catch integrity errors befor commit
            await session.flush()
            return doc.version
        except IntegrityError:
            raise ExistingException(
                "document with same hash has already been archived, review the DB, Document and clear the cache."
            )

    async def _write_document_to_db(self, document: Document, overwrite: bool = False) -> None:
        """Writes a document to the database, archiving the existing one if updating,
           and not when overwrite is True.
        """
        if document.content_hash is None:
            document.content_hash = Document.compute_content_hash(document)

        async with self._sessionmaker() as session:
            result = await session.execute(
                select(Document)
                .where(Document.jurabk == document.jurabk)
            )
            existing = result.first()
            if existing is not None:
                if existing[0].content_hash is None:
                    # fallback for missing hash since it's computed from document object anyway
                    existing_full = await self._load_full_document(existing[0].jurabk, session)
                    existing[0].content_hash = Document.compute_content_hash(existing_full)
                if (existing[0].content_hash == document.content_hash
                   and not overwrite):
                    raise ExistingException("document with same content already exists and overwrite is False")
                if overwrite:
                    await session.delete(existing[0])
                    await session.flush()
                else:
                    await self._archive_document(existing[0], session)
            session.add(document)
            await session.commit()

    @activity.defn(name="parse_norm")
    async def _parse_norm(self, input: ParseNormInput) -> ParseNormResult:
        """fetch from source, parse and write to DB"""
        parser = _get_processor(input.spec)
        try:
            await asyncio.to_thread(parser.fetch_doc, overwrite=input.overwrite)
        except Exception as exc:
            logger.warning("failed to fetch %s: %s", input.spec.slug, exc)
            raise exc
        try:
            document: Document = await asyncio.to_thread(parser.parse_doc)
        except Exception as exc:  # parser failures must not abort the whole run
            logger.warning("failed to parse %s: %s", input.spec.slug, exc)
            raise exc

        try:
            await self._write_document_to_db(document, overwrite=input.overwrite)
            return ParseNormResult(slug=input.spec.slug, jurabk=document.jurabk, status="written")
        except ExistingException as exc:
            return ParseNormResult(slug=input.spec.slug, jurabk=document.jurabk, status="skipped", error=exc.args[0])
        except Exception as exc:
            logger.warning("failed to write %s: %s", input.spec.slug, exc)
            raise exc


async def query_existing_norms() -> list[str]:
    return await workflow.execute_activity(
        UpdateRechtsgrundlageActivities._query_existing_norms,
        start_to_close_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


async def parse_norm(input_: ParseNormInput) -> ParseNormResult:
    return await workflow.execute_activity(
        UpdateRechtsgrundlageActivities._parse_norm,
        input_,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=2),
    )
