"""pdf utilities"""

from pathlib import Path

import pdfplumber
from pdfplumber.pdf import PdfminerException

from event_logging import EventLogger, EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventDefault

from db_services_shared.utils.logging import get_logger
from rechtsaenderungsmonitoring.config import app_config

headers = {"accept": "application/json"}

logger: EventLogger = get_logger(app_config.SERVICE_NAME)


def get_main_heading(file_path: Path) -> str:
    """
    extracts the H1 heading from a pdf
    """

    def filter_func(obj):
        try:
            if "tag" not in obj.keys():
                return False
            if "H1" in obj["tag"]:
                return True
        except TypeError as e:
            logger.error(
                action=EventAction.READ,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.GENERAL,
                message=f"({e}) no Title found in\n{obj.keys()}",
            )
            return False

    try:
        with pdfplumber.open(file_path) as pdf:
            heading = pdf.pages[0].filter(filter_func).extract_text_simple()
    except PdfminerException:
        import pdb

        pdb.set_trace()
        return f"pdfminer exception for {file_path}"

    heading = heading.replace("\n", "")

    if heading == "":
        raise ValueError
    else:
        return heading


def extract_pages_text(file_path: Path) -> list[tuple[int, str]]:
    """
    extracts the text from a pdf document (not scanned)
    and returns a list of text from each page
    """
    if not isinstance(file_path, Path):
        file_path = Path(file_path)

    pages_text = []
    with pdfplumber.open(file_path) as pdf:
        # tmp: cheat sheet
        # all tags
        # set([char["tag"] for char in page.chars])
        # filter tags
        # first_page.filter(lambda x: "H3" in x["tag"]).extract_text_simple()
        for page in pdf.pages:
            pages_text.append((pdf.pages.index(page), page.extract_text_simple()))

    return pages_text
