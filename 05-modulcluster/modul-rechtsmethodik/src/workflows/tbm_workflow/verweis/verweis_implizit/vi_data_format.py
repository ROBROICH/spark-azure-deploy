"""Data models for implicit Verweise."""

from pydantic import BaseModel, ConfigDict, Field


class VerweisAgentOutputImplizit(BaseModel):
    """LLM output for implicit Verweis detection."""

    verweise: list[str] = Field(
        description=("Liste der wörtlich übernommenen impliziten Verweise."),
    )

    model_config = ConfigDict(
        extra="forbid"
    )
