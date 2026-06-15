"""Structured response models for grouped text-claim extraction."""

from pydantic import BaseModel, Field


class TextClaimFormulation(BaseModel):
    """Legacy single-list claim formulation response."""

    claims: list[str] = Field(
        ...,
        description="Eine Liste von präzisen, atomaren und selbsterklärenden Key-Claims",
    )


# ── Grouped multi-chunk extraction + formulation ──


class GroupedClaimItem(BaseModel):
    """One extracted and formulated claim with its source chunk and evidence."""

    chunk_id: int = Field(description="1-based index of the source chunk.")
    quotes: list[str] = Field(description="Exact verbatim quotes from the chunk that support this claim.")
    claim: str = Field(description="Atomic, self-contained fact derived from the quotes.")


class GroupedExtractionResponse(BaseModel):
    """Flat list of claims across all input chunks."""

    claims: list[GroupedClaimItem] = Field(description="All extracted claims.")
