"""base parser prototype"""

from abc import ABC, abstractmethod
from datetime import datetime
from hashlib import blake2s
from pathlib import Path
from time import mktime

from db_services_shared.utils.logging import get_logger
from event_logging import EventAction, EventCategory, EventLogger, EventOutcome
from event_logging.enums import LogEventDefault
from feedparser import FeedParserDict
from feedparser import parse as parse_feed
from httpx import Client
from pydantic import BaseModel, HttpUrl

from rechtsaenderungsmonitoring.config import app_config
from rechtsaenderungsmonitoring.constants import HASH_LENGTH
from rechtsaenderungsmonitoring.schemas.db import Document


class Entry(BaseModel):
    """generic container for RSS entries"""

    title: str
    title_hash: str
    link: HttpUrl
    guid: str
    description: str
    pub_date: datetime

    @property
    def out_path(self) -> Path:
        clean_title = Path(self.title).stem
        if not clean_title or clean_title in {".", ".."}:
            raise ValueError(f"Could not derive a valid filename from title: {self.title}")
        return Path(f"{clean_title}/{clean_title}.pdf")


class RSSParser(ABC):
    """Abstract base class for implementing rss parsers"""

    logger: EventLogger = get_logger(app_config.SERVICE_NAME)
    _current_entries: list[Entry] = []
    current_entries: dict[str, Entry] = {}
    _rss_feed: FeedParserDict = FeedParserDict()

    _http_client = Client(follow_redirects=True)
    cache_dir: Path

    def __init__(
        self,
        cache_dir: Path,
        logger: EventLogger | None = None,
    ) -> None:
        self.cache_dir = cache_dir
        self.logger = logger or self.logger

    def _fetch_feed(self) -> FeedParserDict:
        """fetches rss feed data"""
        # parse from stream, as feedparser uses urllib
        # which is less convenient to mock
        response = self._http_client.get(self._feed_url)
        feed = parse_feed(response.content)
        if feed.bozo:
            self.logger.error(
                action=EventAction.READ,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.SERVICE,
                default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
                message="bozo exception, not updating feed.\n"
                + f"{feed.bozo_exception.getLineNumber()}: "
                + feed.bozo_exception.getMessage(),
            )
        else:
            self._rss_feed = feed
        return self._rss_feed

    @staticmethod
    def _get_title_hash(title: str) -> str:
        """
        return title property as hash string for uniqueness
        checking and unique id
        """
        hash = blake2s(usedforsecurity=False, digest_size=HASH_LENGTH)
        hash.update(title.encode("utf-8"))
        return hash.hexdigest()

    def get_entries(self) -> dict[str, Entry]:
        """returns a list of rss entries as tuples (title, permalink)"""
        self._fetch_feed()
        self._current_entries.clear()
        for entry in self._rss_feed.entries:
            try:
                self._current_entries.append(
                    Entry(
                        title=entry.title,
                        title_hash=self._get_title_hash(entry.title),
                        link=entry.link,
                        guid=entry.guid,
                        description=entry.description,
                        pub_date=datetime.fromtimestamp(mktime(entry.published_parsed)),
                    )
                )
            except AttributeError as e:
                self.logger.error(
                    action=EventAction.VALIDATE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.SERVICE,
                    default_event=LogEventDefault.VALIDATION_FAILURE,
                    message=f"could not parse {entry} ({e})",
                )
            self.current_entries = {entry.title_hash: entry for entry in self._current_entries}
        return self.current_entries

    def get_data(self, entry: Entry, overwrite: bool = False) -> bytes:
        """fetch data for a given entry"""
        # check if cached
        out_path: Path = self.get_out_path(entry)
        if out_path.exists():
            if not overwrite:
                self.logger.warn(
                    action=EventAction.DOWNLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    default_event=LogEventDefault.GENERAL,
                    message="found cached download, " + "set `overwrite=True` if this is undesired behaviour",
                )
                with open(out_path, "rb") as file_:
                    data = file_.read()
                return data
            self.logger.debug(
                action=EventAction.DELETE,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.FILE,
                default_event=LogEventDefault.GENERAL,
                message=f"removing {out_path}",
            )
            out_path.rmdir()

        data = self.fetch_data(entry)

        if not out_path.parent.exists():
            out_path.parent.mkdir(parents=True)
        with open(out_path, "wb") as f:
            f.write(data)

        return data

    def get_out_path(self, entry: Entry) -> Path:
        """returns output path for a given entry doc"""
        return self.cache_dir.joinpath(entry.out_path)

    @property
    @abstractmethod
    def _feed_url(self) -> str:
        """RSS feed url"""
        raise NotImplementedError

    @abstractmethod
    def fetch_data(self, entry: Entry, overwrite: bool = False) -> bytes:
        """
        fetches data to local storage.

        Args:
        entry (Entry): rss feed entry object
        overwrite (bool): wether to fetch if cached item exists
        path (str): short form name (slug) of the required law

        Returns:
        bytes: response content
        """
        pass

    def fetch_and_extract(self, entry: Entry) -> list[tuple[int, str]]:
        """
        Download (if needed) and extract the per-page text for an entry.

        Returns:
            list[tuple[int, str]]: ``(page_number, page_text)`` for each page.
        """
        raise NotImplementedError

    @abstractmethod
    def parse_doc(self, entry: Entry) -> Document:
        """
        Parses the given feed entries content
        and returns a Document object.
        Args:
            entry(Entry): rss entry object
        Returns:
            Document: Document-object that is written to the Database
        """
        pass
