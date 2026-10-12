"""Data models for Ermessensspielraum identification."""

from pydantic import BaseModel, ConfigDict, Field
from temporal.contracts import Ermessensspielraum


class ErmessensspielraumAgentOutputFormat(BaseModel):
    """Ermessensspielraum"""

    entscheidung: Ermessensspielraum = Field(
        description=(
            "Bitte trage hier nur ein, ob es sich um eine 'ermessensentscheidung' "
            "oder eine 'gebundene entscheidung' handelt."
        )
    )

    model_config = ConfigDict(extra="forbid")
