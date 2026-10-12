"""Type definitions for Rechtsfolge workflows."""

from pydantic import BaseModel
from temporal.contracts import (
    ErmessensArt,
    Ermessensspielraum,
    NormTyp,
    Rechtsfolge,
    RechtsfolgenAdressat,
    SatzKategorie,
)

from src.absatz import Absatz


class RFWorkflowSatzOutput(BaseModel):
    """Single sentence output from the Rechtsfolgen-Analyse workflow."""

    satz_nr: str
    markers: list[str]
    satz_text: str
    norm_typ_lvl1: NormTyp
    norm_typ_lvl2: SatzKategorie | None = None
    tatbestandsmerkmale: list[str] | None = None
    rechtsfolge: Rechtsfolge | None = None
    atomare_tatbestandsmerkmale: list[str] | None = None


class RechtsfolgenWorkflowResult(BaseModel):
    """Result of the Rechtsfolgen-Analyse workflow containing all processed Absätze."""

    absaetze: list[Absatz[RFWorkflowSatzOutput]]


class AdressatenErmessenWorkflowOutput(BaseModel):
    """Output of the Adressaten-Ermessen workflow with identified adressat and Ermessen."""

    text: str
    rechtsfolgen_adressat: RechtsfolgenAdressat
    ermessensspielraum: Ermessensspielraum | None = None
    ermessensart: ErmessensArt | None = None
