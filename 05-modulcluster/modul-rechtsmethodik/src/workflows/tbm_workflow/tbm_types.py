"""Type definitions for the TBM workflow."""

from typing import Any

from pydantic import BaseModel
from temporal.workflows.rechtsmethodik.types import (
    Absatz,
    AtomaresTBM,
    NormTyp,
    SatzKategorie,
    Verweise,
)


class TBMWorkflowRechtsfolge(BaseModel):
    """Rechtsfolge result with its text and associated references."""

    text: str
    verweise: Verweise


class TBMWorkflowSatzOutput(BaseModel):
    """Output of the TBM workflow for a single legal sentence."""

    satz_nr: str
    markers: list[str]
    satz_text: str
    norm_typ_lvl_1: NormTyp
    norm_typ_lvl_2: SatzKategorie | None = None
    tatbestandsmerkmale: list[str] | None = None
    rechtsfolge: TBMWorkflowRechtsfolge | None = None
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    formel: str | None = None


class TBMWorkflowOutput(BaseModel):
    """Aggregated TBM workflow output for a full paragraph."""

    gesetz: str
    jurabk: str
    standangaben: list[dict[str, Any]]
    paragraph_nr: str
    paragraph_titel: str
    paragraph_text: str
    absaetze: list[Absatz[TBMWorkflowSatzOutput]]
    regelungsgegenstand: str | None


class VerweisWorkflowInput(BaseModel):
    """Input for the Verweis workflow containing satz identifiers and content."""

    gesetz: str
    paragraph_nr: str
    absatz_nr: str
    satz_nr: str
    satz_text: str
    atomare_tatbestandsmerkmale: list[str]
    rechtsfolge: str


class RechtsbegriffeWorkflowInput(BaseModel):
    """Input for the Rechtsbegriffe workflow with paragraph and sentence context."""

    jurabk: str
    paragraph_nr: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    paragraph_text: str
    satz_text: str
    atomare_tatbestandsmerkmale: list[str]


class FormelextrahiererAgentInput(BaseModel):
    """Input for the Formelextraktion agent with sentence text and TBMs."""

    satz_text: str
    atomare_tatbestandsmerkmale: list[str]
    rechtsfolge: str
