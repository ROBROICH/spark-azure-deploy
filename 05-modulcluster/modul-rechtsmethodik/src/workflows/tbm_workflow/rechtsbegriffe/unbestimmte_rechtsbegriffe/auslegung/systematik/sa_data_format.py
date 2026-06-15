"""Data models for systematische Auslegung."""

from pydantic import BaseModel, ConfigDict, Field


class SystematikAuslegerAgentOutput(BaseModel):
    """LLM output for systematische Auslegung."""

    systematische_auslegung: str = Field(description=("Die systematische Auslegung des unbestimmten Rechtsbegriffs."))

    model_config = ConfigDict(extra="forbid")
