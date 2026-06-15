"""Data models for Ermessensart classification."""

from pydantic import BaseModel, ConfigDict
from temporal.workflows.rechtsmethodik.types import ErmessensArt


class ErmessensArtAgentOutputFormat(BaseModel):
    """Output of the ErmessensArt agent with the classified type of discretion."""

    entscheidung: ErmessensArt

    model_config = ConfigDict(extra="forbid")
