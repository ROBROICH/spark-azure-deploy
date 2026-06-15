"""Data models for historische Auslegung."""

from pydantic import BaseModel, ConfigDict, Field


class HistorieAuslegerAgentOutput(BaseModel):
    """LLM output for historische Auslegung."""

    historische_auslegung: str = Field(description=("Die historische Auslegung des unbestimmten Rechtsbegriffs."))

    model_config = ConfigDict(extra="forbid")
