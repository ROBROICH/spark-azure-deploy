"""Data models for unbestimmte Rechtsbegriffe recognition."""

from pydantic import BaseModel, ConfigDict, Field


class UnbestimmteRechtsbegriffeErkennerAgentOutput(BaseModel):
    """Output of the unbestimmte Rechtsbegriffe agent with all identified terms."""

    unbestimmte_rechtsbegriffe: list[str] = Field(
        description="Liste aller identifizierten unbestimmten Rechtsbegriffe aus der Analyse des juristischen Satzes."
    )

    model_config = ConfigDict(extra="forbid")
