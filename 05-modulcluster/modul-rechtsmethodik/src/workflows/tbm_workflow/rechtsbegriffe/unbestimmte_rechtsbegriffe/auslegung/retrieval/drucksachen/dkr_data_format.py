"""Data models for Drucksachen context retrieval."""

from pydantic import BaseModel, ConfigDict, Field


class DrucksachenKontextAnalysisOutput(BaseModel):
    """LLM output for Drucksachen relevance analysis."""

    relevante_chunks: list[str] = Field(
        description="Liste der IDs der Chunks, die für die Auslegung des unbestimmten Rechtsbegriffs relevant sind.",
    )

    model_config = ConfigDict(extra="forbid")
