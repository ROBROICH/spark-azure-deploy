"""Temporal activities for the monitor_rechtsaenderungen workflow."""

import asyncio
from collections.abc import Callable
from datetime import timedelta
from typing import TYPE_CHECKING

from db_services_shared.utils.logging import get_logger
from event_logging import EventAction, EventCategory, EventLogger, EventOutcome
from event_logging.enums import LogEventDefault
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import select
from temporal.contracts import Bundesland, FeedEntry, RechtsaenderungenSource
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from rechtsaenderungsmonitoring.config import app_config
from rechtsaenderungsmonitoring.parser import BGBLParser, RSSParser, get_parser
from rechtsaenderungsmonitoring.schemas.db import Document, Norm
from rechtsaenderungsmonitoring.schemas.temporal import (
    ExtractEntryResult,
    PageText,
    ParseEntryInput,
    ParseEntryResult,
    PersistDocumentInput,
)

if TYPE_CHECKING:
    from db_services_shared.utils.gesetze_normen import GesetzeNormenDB

logger: EventLogger = get_logger(app_config.SERVICE_NAME)


def _gn_client() -> "GesetzeNormenDB":
    """Build a gesetze-normen-db client from the app config."""
    from db_services_shared.utils.gesetze_normen import GesetzeNormenDB

    from rechtsaenderungsmonitoring.config import app_config

    return GesetzeNormenDB(app_config.gesetze_normen_url)


def _get_parser(
    source: RechtsaenderungenSource,
    location: Bundesland | None = None,
) -> RSSParser:
    """Return the parser for a given feed source."""

    match source:
        case RechtsaenderungenSource.BUND:
            return BGBLParser(app_config.cache_dir)
        case RechtsaenderungenSource.EU:
            raise NotImplementedError("EU source is not yet supported")
        case RechtsaenderungenSource.BUNDESLAND:
            if location is None:
                raise ValueError("No state parser configured: missing `location` argument")
            try:
                parser_class = get_parser(location)
                return parser_class(app_config.cache_dir)
            except Exception as e:
                raise ValueError(f"Failed to get state parser for location {location}: {e}")


class MonitorRechtsaenderungenActivities:
    """Temporal activities for the monitor_rechtsaenderungen workflow.

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
        return [
            self._fetch_feed_entries,
            self._query_existing_doc_ids,
            self._extract_entry,
            self._resolve_jurabks,
            self._get_norm_text,
            self._persist_document,
        ]

    @activity.defn(name="fetch_feed_entries")
    async def _fetch_feed_entries(
        self,
        source: RechtsaenderungenSource,
        location: Bundesland | None = None,
    ) -> list[FeedEntry]:
        parser = _get_parser(source, location)
        entries = await asyncio.to_thread(parser.get_entries)
        return [
            FeedEntry(
                title=entry.title,
                title_hash=entry.title_hash,
                link=entry.link,
                guid=entry.guid,
                description=entry.description,
                pub_date=entry.pub_date,
            )
            for entry in entries.values()
        ]

    @activity.defn(name="query_existing_doc_ids")
    async def _query_existing_doc_ids(self) -> list[str]:
        async with self._sessionmaker() as session:
            result = await session.execute(select(Document.doc_id))
            return [row[0] for row in result.all() if row[0] is not None]

    async def _write_document_to_db(self, document: Document, overwrite: bool) -> None:
        async with self._sessionmaker() as session:
            result = await session.execute(select(Document).where(Document.doc_id == document.doc_id))
            existing = result.first()
            if existing is not None:
                if not overwrite:
                    return
                await session.delete(existing[0])
                await session.flush()
            session.add(document)
            await session.commit()

    @activity.defn(name="extract_entry")
    async def _extract_entry(self, input: ParseEntryInput) -> ExtractEntryResult:
        """Download + extract the entry's PDF pages (no LLM, no DB).

        The workflow then runs the LLM summarisation/categorisation on the
        returned pages and hands the result to ``persist_document``.
        """
        if input.entry.title_hash in set(input.existing_doc_ids) and not input.overwrite:
            return ExtractEntryResult(title_hash=input.entry.title_hash, status="skipped")

        parser = _get_parser(input.source, input.location)
        # Reconstruct the parser-internal Entry so the parser has what it expects.
        from rechtsaenderungsmonitoring.parser.base import Entry as ParserEntry

        parser_entry = ParserEntry(
            title=input.entry.title,
            title_hash=input.entry.title_hash,
            link=input.entry.link,
            guid=input.entry.guid,
            description=input.entry.description,
            pub_date=input.entry.pub_date,
        )
        try:
            pages = await asyncio.to_thread(parser.fetch_and_extract, parser_entry)
        except Exception as exc:
            logger.warn(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.SERVICE,
                default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
                message=f"failed to extract {input.entry.title_hash}: {exc}",
            )
            raise

        return ExtractEntryResult(
            title_hash=input.entry.title_hash,
            title=input.entry.title,
            description=input.entry.description,
            pages=[PageText(page_nr=page_nr, text=text) for page_nr, text in pages],
            status="extracted",
        )

    @activity.defn(name="resolve_jurabks")
    async def _resolve_jurabks(self, names: list[str]) -> dict[str, str | None]:
        """Resolve each norm name to a jurabk via gesetze-normen-db.

        Names that cannot be matched map to ``None`` so the workflow can warn
        and skip them.
        """
        gn_client = _gn_client()
        resolved: dict[str, str | None] = {}
        for name in names:
            resolved[name] = await asyncio.to_thread(gn_client.find_jurabk, name, "bund")
        return resolved

    @activity.defn(name="get_norm_text")
    async def _get_norm_text(self, jurabk: str, paragraph_nr: str) -> str | None:
        """Fetch the current text of a norm paragraph from gesetze-normen-db."""
        gn_client = _gn_client()
        return await asyncio.to_thread(gn_client.get_norm_text, jurabk, paragraph_nr)

    @activity.defn(name="persist_document")
    async def _persist_document(self, input: PersistDocumentInput) -> ParseEntryResult:
        """Resolve jurabks for the workflow-produced norms and write the document."""
        gn_client = _gn_client()

        # Resolve distinct names once to avoid querying gesetze-normen-db excessively.
        distinct_names = {norm.name for norm in input.affected_norms}
        name_to_jurabk: dict[str, str | None] = {}
        for name in distinct_names:
            name_to_jurabk[name] = await asyncio.to_thread(gn_client.find_jurabk, name, "bund")

        affected_norms: list[Norm] = []
        for norm in input.affected_norms:
            jurabk = name_to_jurabk[norm.name]
            if jurabk is None:
                logger.warn(
                    action=EventAction.READ,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.DATABASE,
                    default_event=LogEventDefault.RESOURCE_NOT_FOUND,
                    message=f"no jurabk found for {norm.name}",
                )
                continue
            affected_norms.append(
                Norm(
                    valid_from=norm.valid_from or input.valid_from,
                    **norm.model_dump(exclude={"valid_from"}),
                )
            )

        document = Document(
            doc_id=input.title_hash,
            doc_type=input.doc_type,
            title=input.title,
            affected_norms=affected_norms,
            valid_from=input.valid_from,
        )

        try:
            await self._write_document_to_db(document, input.overwrite)
        except Exception as exc:
            logger.warn(
                action=EventAction.WRITE,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.DB_ERROR,
                message=f"failed to write {input.title_hash}: {exc}",
            )
            raise

        return ParseEntryResult(
            title_hash=input.title_hash,
            doc_id=document.doc_id,
            status="written",
        )


async def fetch_feed_entries(source: RechtsaenderungenSource) -> list[FeedEntry]:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._fetch_feed_entries,
        source,
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=30),
        ),
    )


async def query_existing_doc_ids() -> list[str]:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._query_existing_doc_ids,
        start_to_close_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


async def extract_entry(input_: ParseEntryInput) -> ExtractEntryResult:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._extract_entry,
        input_,
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=2),
    )


async def resolve_jurabks(names: list[str]) -> dict[str, str | None]:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._resolve_jurabks,
        names,
        start_to_close_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


async def get_norm_text(jurabk: str, paragraph_nr: str) -> str | None:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._get_norm_text,
        args=[jurabk, paragraph_nr],
        start_to_close_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


async def persist_document(input_: PersistDocumentInput) -> ParseEntryResult:
    return await workflow.execute_activity(
        MonitorRechtsaenderungenActivities._persist_document,
        input_,
        start_to_close_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )


# Re-exported so workflow.py reads as a flat list of activity helpers,
# mirroring the gesetze-normen-db worker layout.
__all__ = [
    "MonitorRechtsaenderungenActivities",
    "Norm",
    "extract_entry",
    "fetch_feed_entries",
    "get_norm_text",
    "persist_document",
    "query_existing_doc_ids",
    "resolve_jurabks",
]
