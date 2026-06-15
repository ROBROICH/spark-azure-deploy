"""Type definitions for Verweis workflows."""

from pydantic import BaseModel


class VerweisAgentInputImplizit(BaseModel):
    """Input for the implicit Verweis agent with atomic TBMs and Rechtsfolge."""

    satz_text: str
    atomare_tatbestandsmerkmale: list[str]
    rechtsfolge: str


class VerweisAgentInputExplizit(BaseModel):
    """Input for the explicit Verweis agent."""

    gesetz: str
    paragraph_nr: str
    atomare_tatbestandsmerkmale: list[str]
    rechtsfolge: str
