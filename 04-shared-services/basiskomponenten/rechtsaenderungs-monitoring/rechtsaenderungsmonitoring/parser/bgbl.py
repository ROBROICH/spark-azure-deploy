"""bundesgesetzblatt specific parser"""

from event_logging import EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventDefault

from rechtsaenderungsmonitoring.config import app_config
from rechtsaenderungsmonitoring.parser.base import RSSParser, Entry
from rechtsaenderungsmonitoring.schemas.db import Document
from rechtsaenderungsmonitoring.utils.pdf import extract_pages_text
from db_services_shared.utils.gesetze_normen import GesetzeNormenDB


class BGBLParser(RSSParser):
    """Bundesgesetzblatt RSS Parser"""

    main_endpoint = "regelungstext.pdf?__blob=publicationFile"
    zip_parameter = "view=zipdownload"

    # overrides
    _feed_url = "https://www.gesetze-im-internet.de/aktuDienst-rss-feed.xml"
    gn_client = None

    def __init__(self, cache_dir=None, logger=None, gesetze_normen_client=None):
        """initialise class"""
        super().__init__(cache_dir, logger)
        self.gn_client = gesetze_normen_client or GesetzeNormenDB(app_config.gesetze_normen_url)

    def fetch_data(self, entry: Entry) -> bytes:
        """fetch data from rss links"""
        try:
            response = self._http_client.get(f"{entry.link}/{self.main_endpoint}")
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

    def get_content_text(self, entry: Entry):
        """return entry content as a string"""
        extract_pages_text(self.get_out_path(entry))

    def fetch_and_extract(self, entry: Entry) -> list[tuple[int, str]]:
        """Download (if needed) the entry's PDF and extract its per-page text.

        The LLM summarisation/categorisation and jurabk resolution that used to
        live in ``parse_doc`` now run at the workflow level (via the shared
        ``llm_invoke`` activity) and in the ``persist_document`` activity.
        """
        self.logger.debug(
            action=EventAction.READ,
            outcome=EventOutcome.IN_PROGRESS,
            category=EventCategory.FILE,
            default_event=LogEventDefault.GENERAL,
            message=f"extracting:\n{entry.title} - {entry.description}",
        )
        out_path = self.get_out_path(entry)
        if not out_path.exists():
            self.get_data(entry)
        return extract_pages_text(out_path)

    def parse_doc(self, entry: Entry) -> Document:
        """Deprecated: extraction and persistence are split across Temporal steps.

        Use :meth:`fetch_and_extract` plus the workflow LLM step and the
        ``persist_document`` activity instead.
        """
        raise NotImplementedError(
            "BGBLParser.parse_doc was split into fetch_and_extract + the workflow "
            "LLM step + the persist_document activity"
        )
