"""Output formats for the summarization workflow."""

from pydantic import BaseModel, Field

_NAME_NO_THEME = "Kein Thema"

class ThemeClassificationOutput(BaseModel):
    """Pydantic model for the final theme classification output."""
    name: str = Field(
        ...,
        description="name des gewählten Themas.",
    )
    reasoning: str = Field(
        ...,
        description="kurze Begründung."
    )