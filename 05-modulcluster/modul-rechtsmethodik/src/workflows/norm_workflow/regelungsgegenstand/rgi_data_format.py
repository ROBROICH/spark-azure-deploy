"""Data models for Regelungsgegenstand identification."""

from pydantic import BaseModel, ConfigDict, Field


class RegelungsgegenstandsIdentifikatorOutput(BaseModel):
    """Output of the Regelungsgegenstand agent with a concise subject-matter description."""

    regelungsgegenstand: str = Field(
        description="Kurze, präzise Beschreibung des rechtlich geregelten Sachverhalts im Paragraphen.",
    )
    model_config = ConfigDict(extra="forbid")
