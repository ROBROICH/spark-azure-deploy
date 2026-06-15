"""bayern rss parser"""

# from pathlib import Path
from event_logging import EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventDefault

from rechtsaenderungsmonitoring.parser.base import Entry, RSSParser

# from rechtsaenderungsmonitoring.schemas.db import Document, DocType


class BayParser(RSSParser):
    # Gesetz- und Verordungsblatt
    _feed_url = "https://www.verkuendung-bayern.de/service/rss-feed/gvbl-rss/list/"

    def get_download_url(entry: Entry) -> str:
        """construct download url from entry"""
        raise NotImplementedError

    def fetch_data(self, entry: Entry, overwrite: bool = False) -> bytes:
        """fetch data from rss links"""
        try:
            response = self._http_client.get(f"{entry.link}")
            response.raise_for_status()
        except AssertionError as e:
            self.logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.SERVICE,
                default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
                message=f"could not fetch {entry}",
            )
            raise e

        return response.content

    def parse_doc(self, entry):
        raise NotImplementedError
