"""Data models for norm type classification."""

from pydantic import BaseModel, ConfigDict, Field
from temporal.contracts import NormTyp


class NormTypAgentOutput(BaseModel):
    """Output of the NormTyp agent with the classified norm type."""

    norm_typ: NormTyp = Field(
        description="Klassifikation in materiell-rechtlich oder verfahrensrechtlich",
    )
    model_config = ConfigDict(extra="forbid")
