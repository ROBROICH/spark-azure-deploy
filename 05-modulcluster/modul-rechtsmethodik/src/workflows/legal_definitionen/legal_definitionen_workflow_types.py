"""Type definitions for the legal definitions workflow."""

from pydantic import BaseModel


class ParagraphInput(BaseModel):
    """Input representing a single paragraph to process."""

    jurabk: str
    paragraph_nr: str
    paragraph_text: str
    titel: str
    ist_begriffsbestimmungen: bool


class LegalDefinitionenWorkflowInput(BaseModel):
    """Top-level input for the legal definitions workflow."""

    paragraphs: list[ParagraphInput]


class LegalDefinitionEntry(BaseModel):
    """A single extracted legal definition with source metadata."""

    jurabk: str
    paragraph_nr: str
    titel: str
    begriff: str
    definition: str
