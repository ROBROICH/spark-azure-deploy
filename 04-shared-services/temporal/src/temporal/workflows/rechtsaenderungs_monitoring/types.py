from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl

from temporal.workflows.gesetze_normen.types import Bundesland

# redefined from rechtsaenderungsmonitoring.constants because of circular import
class Source(str, Enum):
    """toggles for different rss feed sources"""

    EU = "EU"
    BUND = "Bund"
    BUNDESLAND = "Bundesland"


class FeedEntry(BaseModel):
    """RSS feed entry exchanged between activities.

    Mirrors ``rechtsaenderungsmonitoring.parser.base.Entry`` but is redeclared
    here so callers and tests do not have to import the service package.
    """

    title: str
    title_hash: str
    link: HttpUrl
    guid: str
    description: str
    pub_date: datetime


class MonitorRechtsaenderungenInput(BaseModel):
    """Input for the ``MonitorRechtsaenderungenWorkflow``."""

    source: Source = Field(
        description="Which RSS feed source to refresh.",
    )
    location: Bundesland | None = Field(
        default=None,
        description="Optional location to filter sources.",
    )
    entry_titles: list[str] | None = Field(
        default=None,
        description=(
            "Optional subset of titles to process. "
            "If None, all entries returned by the feed are processed."
        ),
    )
    overwrite: bool = Field(
        default=False,
        description="If true, re-parse and replace documents that are already stored.",
    )


class MonitorRechtsaenderungenOutput(BaseModel):
    """Summary of the ``MonitorRechtsaenderungenWorkflow`` run."""

    written: int
    skipped: int
    failed: int
