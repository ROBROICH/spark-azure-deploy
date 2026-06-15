"""Data models for Auslegungsergebnis."""

from pydantic import BaseModel, ConfigDict, Field


class ErgebnisFormuliererAgentOutput(BaseModel):
    """LLM output for Auslegungsergebnis formulation."""

    auslegung: str = Field(description=("Die zusammengeführte und formulierte Auslegung des unbestimmten Rechtsbegriffs basierend auf den verschiedenen Auslegungsmethoden."))

    model_config = ConfigDict(extra="forbid")
