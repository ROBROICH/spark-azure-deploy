"""Data models for Rechtsfolge construction."""

from pydantic import BaseModel, ConfigDict, Field


class RechtsfolgeKonstrukteurAgentOutput(BaseModel):
    """Output of the Rechtsfolge-Konstrukteur agent with a reconstructed Rechtsfolge sentence."""

    rechtsfolge_neu: str = Field(
        description="Vollständig rekonstruierte Rechtsfolge als eigenständiger Satz ohne Rückbezüge.",
    )

    model_config = ConfigDict(extra="forbid")
