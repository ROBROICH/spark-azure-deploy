"""Data models for predicate logic extraction."""

from pydantic import BaseModel, ConfigDict, Field


class PraedikatenlogikModelliererAgentOutput(BaseModel):
    """Output of the Praedikatenlogik-Modellierer agent with Tatbestandsmerkmale and Rechtsfolgen."""

    tatbestandsmerkmale: list[str] = Field(
        description=(
            "Liste von Tatbestandsmerkmalen (Voraussetzungen), die gemeinsam eine "
            "oder mehrere Rechtsfolgen auslösen. Auch ein einzelnes Merkmal ist als "
            "Liste anzugeben."
        ),
    )
    rechtsfolgen: list[str] = Field(
        description=(
            "Liste von Rechtsfolgen, die sich aus der Erfüllung der zugehörigen "
            "Tatbestandsmerkmale ergeben. Kann eine oder mehrere Rechtsfolgen "
            "enthalten."
        ),
    )
    model_config = ConfigDict(extra="forbid")
