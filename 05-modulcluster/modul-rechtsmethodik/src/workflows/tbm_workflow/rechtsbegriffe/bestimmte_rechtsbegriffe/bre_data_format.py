"""Data models for bestimmte Rechtsbegriffe."""

from pydantic import BaseModel, ConfigDict, Field


class BestimmteRechtsbegriffeErkennerAgentOutput(BaseModel):
    """Output of the bestimmte Rechtsbegriffe agent with matched term IDs."""

    begriffe: list[str] = Field(
        description=(
            "Liste der IDs der bestimmten Rechtsbegriffe, die im Satz gefunden wurden. "
        )
    )

    model_config = ConfigDict(extra="forbid")
