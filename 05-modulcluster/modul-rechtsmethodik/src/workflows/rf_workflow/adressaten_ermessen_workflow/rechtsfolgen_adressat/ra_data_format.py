"""Data models for Rechtsfolgen-Adressat identification."""

from pydantic import BaseModel, ConfigDict, Field
from temporal.contracts import RechtsfolgenAdressat


class RechtsfolgenAdressatenAgentOutputFormat(BaseModel):
    """LLM-Output: Bewertung, ob eine behördliche Handlungsermächtigung vorliegt."""

    entscheidung: RechtsfolgenAdressat = Field(
        description="""
            Klassifikation der Rechtsfolge im Hinblick
            auf eine behördliche Handlungsermächtigung.
        """
    )

    model_config = ConfigDict(extra="forbid")
