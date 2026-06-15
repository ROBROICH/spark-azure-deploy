"""Data models for teleologische Auslegung."""

from pydantic import BaseModel, ConfigDict, Field


class TelosAuslegerAgentOutput(BaseModel):
    """LLM output for teleologische Auslegung."""

    teleologische_auslegung: str = Field(description=("Die teleologische Auslegung des unbestimmten Rechtsbegriffs."))

    model_config = ConfigDict(extra="forbid")
