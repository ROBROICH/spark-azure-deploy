"""Type definitions for unbestimmte Rechtsbegriffe workflows."""

from pydantic import BaseModel
from temporal.workflows.rechtsmethodik.types import (
    UnbestimmterRechtsbegriff,
)


class UnbestimmteRechtsbegriffePrueferAgentInput(BaseModel):
    """Input for the unbestimmte Rechtsbegriffe Prüfer agent."""

    ure_output: list[UnbestimmterRechtsbegriff]
    jurabk: str


class AuslegungWorkflowInput(BaseModel):
    """Input for the Auslegung workflow with full sentence and paragraph context."""

    jurabk: str
    paragraph_nr: str
    paragraph_text: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    satz_text: str
    urp_output: list[UnbestimmterRechtsbegriff]
