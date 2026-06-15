"""Type definitions for the Wortlaut workflow."""

from pydantic import BaseModel


class WortlautProcessor(BaseModel):
    """Intermediate state for tracking word extraction and interpretation."""

    id: str
    u_begriff: str
    meanings_dict: dict[str, list[str]] = {}
    wiki_source_dict: dict[str, str] = {}


class WortlautAuslegerAgentInput(BaseModel):
    """Input for a single Wortlaut interpretation agent call."""

    satz_text: str
    paragraph_text: str
    u_rechtsbegriffe: list[WortlautProcessor]
