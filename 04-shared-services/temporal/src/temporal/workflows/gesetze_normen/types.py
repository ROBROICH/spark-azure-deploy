from typing import Any
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl


# redefined from gesetze-normen-db-service/db_pipelines/constants.py
# because of circular import
class Source(str, Enum):
    """toggles for different data sources"""

    BUND = "bund"
    EU = "eu"
    BUNDESLAND = "bundesland"


class Bundesland(str, Enum):
    """
    state law sources
    short forms from [destatis](https://www.destatis.de/DE/Methoden/abkuerzung-bundeslaender-DE-EN.html)  # noqa: E501
    """

    BY = "Bayern"
    BW = "Baden-Württemberg"
    BE = "Berlin"
    BB = "Brandenburg"
    HB = "Bremen"
    HH = "Hamburg"
    HE = "Hessen"
    MV = "Mecklenburg-Vorpommern"
    NI = "Niedersachsen"
    NW = "Nordrhein-Westfalen"
    RP = "Rheinland-Pfalz"
    SL = "Saarland"
    SN = "Sachsen"
    ST = "Sachsen-Anhalt"
    SH = "Schleswig-Holstein"
    TH = "Thüringen"


# redefined from gesetze-normen-db-service/db_pipelines/config.py
# because of circular import
class BaseRelevantLaws(BaseModel):
    """Base class for relevant laws list"""

    parser: str = Field(..., description="Name of the parser class")
    extra: dict[str, Any] = Field(default_factory=dict, description="Additional keyword arguments for the parser")
    base_url: HttpUrl

    gesetz: list[str] | None = None
    verordnung: list[str] | None = None
    richtlinie: list[str] | None = None
    verwaltungsvorschrift: list[str] | None = None
    technische_norm: list[str] | None = None


class StateRelevantLaws(BaseRelevantLaws):
    """Relevant state law (includes state name)"""

    name: Bundesland


class RelevantLaws(BaseModel):
    """config for case-relevant laws"""

    eu: BaseRelevantLaws | None = None
    bund: BaseRelevantLaws | None = None
    # supports both single bundesland (legacy) and multiple
    bundesland: StateRelevantLaws | None = None
    bundeslaender: list[StateRelevantLaws] | None = None


class UpdateRechtsgrundlageInput(BaseModel):
    """Input for the ``UpdateRechtsgrundlageWorkflow``."""

    pipeline_config: RelevantLaws = Field(
        ...,
        description="Pipeline configuration for the workflow.",
    )
    overwrite: bool = Field(
        default=False,
        description="If true, replace existing rows in the documents table.",
    )


class UpdateRechtsgrundlageOutput(BaseModel):
    """Summary of the ``UpdateRechtsgrundlageWorkflow`` run."""

    written: int
    skipped: int


class UpdateRechtsgrundlageSourceInput(BaseModel):
    """Input for the ``UpdateRechtsgrundlageSource`` sub-workflow.

    One sub-workflow handles a single parser-block: EU, Bund, or a single
    Bundesland. ``location`` is required when ``source`` is ``STATE_LAW``.
    """

    source: Source
    location: Bundesland | None = None
    overwrite: bool = False
    laws: BaseRelevantLaws


class UpdateRechtsgrundlageSourceOutput(BaseModel):
    """Summary of an ``UpdateRechtsgrundlageSource`` sub-workflow run."""

    written: int
    skipped: int
