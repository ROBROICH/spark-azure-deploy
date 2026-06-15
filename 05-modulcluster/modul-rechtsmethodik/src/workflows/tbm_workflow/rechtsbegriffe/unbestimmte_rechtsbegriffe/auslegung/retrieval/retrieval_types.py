"""Type definitions for context retrieval workflows."""

from pydantic import BaseModel

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import UTCitation


class UrteileKontextRetrievalWorkflowInput(BaseModel):
    """Input for Urteile context retrieval."""

    begriff: str
    name: str
    name_suffix: str | None = None
    paragraph_nr: str
    absatz_nr: str


class DrucksachenKontextRetrievalAgentInput(BaseModel):
    """Input for Drucksachen context retrieval."""

    jurabk: str
    normstelle: str
    satz_text: str
    begriff: str
    section_substrings: list[str]


class FormattedDrucksachenChunk(BaseModel):
    """A formatted Drucksache chunk ready for LLM filtering."""

    id: str
    dokumentnummer: str
    datum: str
    chunk_titel: str
    chunk_text: str
    seite: str
    zitierte_urteile: list[UTCitation] = []
