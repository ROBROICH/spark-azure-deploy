"""Data models for Urteil context relevance analysis."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

type FollowUpQueryList = Annotated[list[str], Field(min_length=2, max_length=2)]


class RelevantChunk(BaseModel):
    """A single relevant chunk from an Urteil."""

    aktenzeichen: str = Field(..., description="Aktenzeichen des Urteils, z. B. '9 A 18/15'.")
    randnummer: str = Field(..., description="Randnummer der relevanten Passage im Urteil, z. B. '84'.")

    model_config = ConfigDict(extra="forbid")


class UrteileKontextAnalysisWithFollowUpQueriesOutput(BaseModel):
    """LLM output with follow-up queries and relevant Urteil chunks."""

    follow_up_queries: FollowUpQueryList = Field(
        ...,
        description="Zwei präzise natürlichsprachliche Queries für die Vektordatenbank-Suche, die auf die identifizierten weißen Flecken abzielen.",
    )
    relevant_chunks: list[RelevantChunk] = Field(
        ..., description="Liste der Chunks, die den Rechtsbegriff relevant behandeln."
    )

    model_config = ConfigDict(extra="forbid")


class UrteileKontextAnalysisOutput(BaseModel):
    """Final LLM output with relevant Urteil chunks only."""

    relevant_chunks: list[RelevantChunk] = Field(
        ..., description="Liste der Chunks, die den Rechtsbegriff relevant behandeln."
    )

    model_config = ConfigDict(extra="forbid")
