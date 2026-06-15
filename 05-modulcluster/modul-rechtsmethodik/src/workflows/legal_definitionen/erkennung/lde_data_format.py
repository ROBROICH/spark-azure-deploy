"""Data models for legal definition extraction."""

from pydantic import BaseModel, ConfigDict, Field


class LegalTermsListEntry(BaseModel):
    """A single legal term with its definition and source paragraph."""

    begriff: str = Field(
        description=(
            "Der juristisch definierte Rechtsbegriff. "
            "Es darf nur ein Begriff pro Eintrag sein; mehrere Begriffe "
            "müssen in separaten Einträgen erfasst werden."
        )
    )
    definition: str = Field(description="Wortlaut der Definition")

    model_config = ConfigDict(extra="forbid")


class LegalTermsList(BaseModel):
    """Collection of extracted legal terms."""

    rechtsbegriffe: list[LegalTermsListEntry] = Field(
        description="Liste aller juristisch Legaldefinierter Begriffe in der Norm."
    )
    model_config = ConfigDict(extra="forbid")


class LegalDefinitionenExtrahiererAgentInput(BaseModel):
    """Input for the legal definition extraction agent."""

    paragraph_text: str
    ist_begriffsbestimmungen: bool
