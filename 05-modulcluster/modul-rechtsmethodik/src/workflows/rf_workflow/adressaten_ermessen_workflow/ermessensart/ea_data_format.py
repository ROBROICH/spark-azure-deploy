"""Data models for Ermessensart classification."""

from pydantic import BaseModel, ConfigDict
from temporal.contracts import ErmessensArt


class ErmessensArtAgentOutputFormat(BaseModel):
    """Output of the ErmessensArt agent with the classified type of discretion."""

    entscheidung: ErmessensArt

    model_config = ConfigDict(extra="forbid")
