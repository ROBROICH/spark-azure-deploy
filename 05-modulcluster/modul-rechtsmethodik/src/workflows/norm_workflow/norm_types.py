"""Shared type definitions for norm deconstruction workflows."""

from typing import Any

from pydantic import BaseModel
from temporal.contracts import NormTyp, SatzKategorie

from src.absatz import Absatz


class NormDekonstruktionWorkflowSatzInput(BaseModel):
    """Single sentence input for the NormDekonstruktion workflow."""

    satz_nr: str
    markers: list[str]
    satz_text: str


class NormDekonstruktionWorkflowInput(BaseModel):
    """Full paragraph input for the NormDekonstruktion workflow."""

    gesetz: str
    jurabk: str
    standangaben: list[dict[str, Any]]
    paragraph_nr: str
    paragraph_titel: str
    paragraph_text: str
    absaetze: list[Absatz[NormDekonstruktionWorkflowSatzInput]]


class NormDekonstruktionWorkflowSatzOutput(BaseModel):
    """Single sentence output from the NormDekonstruktion workflow."""

    satz_nr: str
    markers: list[str]
    satz_text: str
    norm_typ_lvl1: NormTyp
    norm_typ_lvl2: SatzKategorie | None = None
    tatbestandsmerkmale: list[str] | None = None
    rechtsfolge: str | None = None
    atomare_tatbestandsmerkmale: list[str] | None = None


class NormDekonstruktionWorkflowOutput(BaseModel):
    """Full paragraph output from the NormDekonstruktion workflow."""

    gesetz: str
    jurabk: str
    standangaben: list[dict[str, Any]]
    paragraph_nr: str
    paragraph_titel: str
    paragraph_text: str
    absaetze: list[Absatz[NormDekonstruktionWorkflowSatzOutput]]
    regelungsgegenstand: str | None


class AtomarisierungsAgentInput(BaseModel):
    """Input for the Atomarisierungs agent containing sentence text and Tatbestandsmerkmale."""

    satz_text: str
    tatbestandsmerkmale: list[str]


class RechtsfolgeKonstrukteurAgentInput(BaseModel):
    """Input for the Rechtsfolge-Konstrukteur agent with sentence text and raw Rechtsfolgen."""

    satz_text: str
    rechtsfolgen_raw: list[str]


class WennDannFormulierungsAgentInput(BaseModel):
    """Input for the Wenn-Dann-Formulierungs agent with Tatbestandsmerkmale and Rechtsfolgen."""

    tatbestandsmerkmale: list[str]
    rechtsfolgen: list[str]
