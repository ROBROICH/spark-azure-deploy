"""Shared types for the Rechtsbegriffe sub-workflows."""

from pydantic import BaseModel


class BestimmteRechtsbegriffeErkennerAgentInput(BaseModel):
    """Input for the bestimmte Rechtsbegriffe agent with paragraph and TBM context."""

    jurabk: str
    satz_text: str
    atomare_tatbestandsmerkmale: list[str]


class UnbestimmteRechtsbegriffeWorkflowInput(BaseModel):
    """Input for the unbestimmte Rechtsbegriffe workflow with full sentence context."""

    jurabk: str
    paragraph_nr: str
    paragraph_text: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    satz_text: str
    atomare_tatbestandsmerkmale: list[str]