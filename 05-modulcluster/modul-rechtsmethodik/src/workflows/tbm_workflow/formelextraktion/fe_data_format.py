"""Data models for formula extraction."""

from pydantic import BaseModel, ConfigDict, Field


class FormelextrahiererAgentOutput(BaseModel):
    """Output of the Formelextraktion agent with the extracted predicate-logic formula."""

    formel: str = Field(
        description=(
            "Die prädikatenlogische Formel, welche die logische Verknüpfung der Tatbestandsmerkmale beschreibt."
        ),
    )

    model_config = ConfigDict(extra="forbid")
