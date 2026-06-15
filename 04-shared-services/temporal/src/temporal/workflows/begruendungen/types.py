"""Shared Temporal types for the UpdateBegruendungen workflow family.

All types are redefined from the service package to avoid circular imports
between the temporal shared library and begruendungen-db-service.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# Redefined from db_services_shared.constants
class Hierarchy(str, Enum):
    EU = "eu"
    BUND = "bund"
    BUNDESLAND = "bundesland"
    KOMMUNE = "kommune"


class BundeslandParam(str, Enum):
    BY = "BY"
    BW = "BW"
    BE = "BE"
    BB = "BB"
    HB = "HB"
    HH = "HH"
    HE = "HE"
    MV = "MV"
    NI = "NI"
    NW = "NW"
    RP = "RP"
    SL = "SL"
    SN = "SN"
    ST = "ST"
    SH = "SH"
    TH = "TH"


# Redefined from begruendungen_db.config
class Source(str, Enum):
    DIP_DRUCK = "dip_druck"


class GNDocData(BaseModel):
    """Serializable subset of GNDoc exchanged between activities."""

    jurabk: str
    kurzue: str
    langue: str
    hierarchy: Hierarchy
    bundesland: BundeslandParam | None = None


class SourceConfigInput(BaseModel):
    """One source/hierarchy/(optional bundesland) combination to ingest."""

    source: Source
    hierarchy: Hierarchy
    bundesland: BundeslandParam | None = None
    extra: dict[str, Any] | None = None
    overwrite: bool = False


class ProcessLawDocInput(BaseModel):
    """Input for the process_law_doc activity."""

    law_doc: GNDocData
    source: Source
    extra: dict[str, Any] | None = None
    overwrite: bool = False


class ProcessLawDocResult(BaseModel):
    """Per-law_doc activity result."""

    jurabk: str
    written: int
    skipped: int
    failed: int


class ProcessSingleDocResult(BaseModel):
    jurabk: str
    status: str
    error: str | None = None


class ProcessSingleDocInput(BaseModel):
    """Input for the process_law_doc activity (single document)."""

    law_doc: GNDocData
    source: Source
    extra: dict[str, Any] | None = None
    overwrite: bool = False
    document_meta: dict[str, Any]


class UpdateBegruendungenSourceInput(BaseModel):
    """Input for the UpdateBegruendungenSourceWorkflow sub-workflow."""

    source_config: SourceConfigInput


class UpdateBegruendungenSourceOutput(BaseModel):
    """Summary of one UpdateBegruendungenSourceWorkflow run."""

    written: int
    skipped: int
    failed: int


class UpdateBegruendungenInput(BaseModel):
    """Input for the top-level UpdateBegruendungenWorkflow."""

    sources: list[SourceConfigInput] = Field(
        description="One entry per source/hierarchy/bundesland combination to ingest.",
    )


class UpdateBegruendungenOutput(BaseModel):
    """Aggregated summary of an UpdateBegruendungenWorkflow run."""

    written: int
    skipped: int
    failed: int
