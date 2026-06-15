"""Data models for atomarisierung output."""

from pydantic import BaseModel, ConfigDict, Field


class AtomarisierungsAgentOutput(BaseModel):
    """Output of the Atomarisierungs agent with atomically formulated Tatbestandsmerkmale."""

    tatbestandsmerkmale: list[str] = Field(
        min_length=1,
        description=(
            "Liste von atomar formulierten Tatbestandsmerkmalen (Wenn-Sätzen). "
            "Jedes Merkmal muss einzeln prüfbar und vollständig ausformuliert sein."
        ),
    )
    model_config = ConfigDict(extra="forbid")