"""Type definitions for the Auslegung (interpretation) sub-workflows."""

from pydantic import BaseModel, field_validator
from temporal.contracts import (
    UnbestimmterRechtsbegriff,
)


class UTCitation(BaseModel):
    """Citation metadata for an Urteilstext."""

    aktenzeichen: str
    randnummer: str
    text: str | None = None


class UTNorm(BaseModel):
    """Norm reference within an Urteilstext."""

    name: str
    name_suffix: str | None = None
    paragraph: str
    absatz: str | None = None


class UTChunk(BaseModel):
    """A chunk of Urteilstext with its metadata."""

    section_title: str
    section_number: str
    section_text: str
    chunk_index: int
    start_char: int
    end_char: int
    section_length: int
    is_complete_section: bool
    is_part_of: str | None = None
    id: int
    doc_id: str
    gericht: str
    datum: str
    aktenzeichen: str
    dokumenttyp: str
    normen: list[UTNorm]
    similarity: float | None = None
    zitierte_urteile: list[UTCitation] = []

    @field_validator("normen", mode="before")
    @classmethod
    def filter_norms_without_paragraph(cls, v: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
        """Remove norms that lack a paragraph reference."""
        return [n for n in v if n.get("paragraph") is not None]


class DrucksachenChunk(BaseModel):
    """A chunk of Drucksachen text with metadata."""

    dokumentnummer: str
    datum: str
    seite: str
    text: str
    zitierte_entscheidungen: list[UTCitation]


class UnbestimmterRechtsbegriffWithContext(UnbestimmterRechtsbegriff):
    """An unbestimmter Rechtsbegriff enriched with retrieval context."""

    u_context: list[UTChunk]
    d_context: list[DrucksachenChunk]


class AuslegerAgentInput(BaseModel):
    """Input for an individual Auslegung agent."""

    jurabk: str
    paragraph_nr: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    satz_text: str
    enriched_urp: list[UnbestimmterRechtsbegriffWithContext]


TelosAuslegerAgentInput = AuslegerAgentInput
HistorieAuslegerAgentInput = AuslegerAgentInput
SystematikAuslegerAgentInput = AuslegerAgentInput
UrteilKlassifikationInput = AuslegerAgentInput


class WortlautAuslegungWorkflowInput(BaseModel):
    """Input for the Wortlaut-Auslegung sub-workflow."""

    satz_text: str
    paragraph_text: str
    enriched_urp: list[UnbestimmterRechtsbegriffWithContext]


class NormInfo(BaseModel):
    """Metadata for a referenced norm in systematic interpretation."""

    normstelle: str
    titel: str
    text: str
