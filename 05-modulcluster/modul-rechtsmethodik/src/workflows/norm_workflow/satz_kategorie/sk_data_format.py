"""Data models for Satz-Kategorie classification."""

from pydantic import BaseModel, ConfigDict, Field
from temporal.contracts import SatzKategorie


class SatzKategorieAgentOutput(BaseModel):
    """Output of the SatzKategorie agent with the classified sentence category."""

    kategorie: SatzKategorie = Field(
        description=(
            "Rechtsmethodische Kategorisierung des Satzes: "
            "'wenn-dann', 'abwägungsdirektive', 'begriffserklärung', 'sonstiges'."
        )
    )
    
    model_config = ConfigDict(extra="forbid")
