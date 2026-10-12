"""Data models for Sollensanordnungen classification."""

from pydantic import BaseModel, ConfigDict, Field
from temporal.contracts import Sollensanordnungen


class SollensanordnungenAgentOutputFormat(BaseModel):
    """Sollensanfoderungen"""

    kategorie: Sollensanordnungen = Field(description="Die erkannte Kategorie der materiell-rechtlichen Rechtsfolge.")

    model_config = ConfigDict(extra="forbid")
