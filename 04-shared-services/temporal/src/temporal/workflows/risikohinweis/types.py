"""Shared types for the Risikohinweis child workflow.

This module provides the types needed by callers executing
RiskCheckerWorkflow as a child workflow from the temporal package.
"""

from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PFBChapter(BaseModel):
    """Input type for the RiskCheckerWorkflow child workflow.

    Represents a chapter from a Planfeststellungsbeschluss (PFB) document
    to be analyzed for quality risks.
    """

    id: UUID = Field(default_factory=uuid4, description="Eindeutige ID des Kapitels")
    title: str | None = None
    text: str


class RiskFinding(BaseModel):
    """A single risk finding from the RiskCheckerWorkflow."""

    risk_id: UUID = Field(default_factory=uuid4, description="Eindeutige ID des Risikos")
    chapter_id: UUID = Field(
        default_factory=uuid4, description="Eindeutige ID des Kapitels, auf das sich der Risikohinweis bezieht"
    )
    quote: str = Field(description="Der konkrete Textausschnitt, der den Risikohinweis illustriert")
    description: str = Field(description="Beschreibung des Risikos")
    implications: str = Field(description="Mögliche Auswirkungen des Risikos")
    recommendation: str = Field(description="Empfohlene Maßnahmen zur Risikominderung")
    severity: int = Field(
        ge=1, le=10, description="Schwere des Risikos auf einer Skala von 1 (gering) bis 10 (sehr hoch)"
    )


class RiskFinderOutput(BaseModel):
    """Output type from the RiskCheckerWorkflow child workflow."""

    risks: list[RiskFinding]


__all__ = [
    "PFBChapter",
    "RiskFinderOutput",
    "RiskFinding",
]