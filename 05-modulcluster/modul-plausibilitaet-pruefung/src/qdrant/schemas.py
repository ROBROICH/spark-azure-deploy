"""Payload models exchanged with Qdrant and LLM prompt preparation."""

from typing import Any

from pydantic import BaseModel, Field


class ClaimEntities(BaseModel):
    """Structured semantic dimensions previously extracted for a claim."""

    space_factor: str
    reference_object: str
    reference_attribute: str
    modality_factor: str


class ClaimEvidence(BaseModel):
    """Verbatim source quotes that support an extracted claim."""

    claim_quotes: list[str] | None = None


class ClaimMetadata(BaseModel):
    """Claim identity and text content nested inside the Qdrant payload."""

    claim_id: str = Field(description="Identifier of the claim")
    claim_content: str = Field(description="Content of the claim as free text")
    evidence: ClaimEvidence = Field(description="Sentences from the chunk supporting the claim")


class ClaimPayload(BaseModel):
    """Flattened payload retrieved from Qdrant containing project, document, chunk, and claim details."""

    project_id: str = Field(description="Identifier of the project the claim belongs to.")
    document_id: str = Field(description="Identifier of the document the claim was extracted from.")
    title: str | None = Field(default=None, description="Optional human-readable title of the document.")
    chunk_id: str = Field(description="Identifier of the chunk the claim originated from.")
    erlauterungsbericht: bool = Field(
        default=False, description="Whether this claim is from the Erlauterungsbericht or not"
    )
    claim_metadata: ClaimMetadata
    vector: list[float] | None = None

    @property
    def claim_id(self) -> str:
        """Expose the nested claim identifier as a top-level convenience property."""

        return self.claim_metadata.claim_id

    @property
    def claim_text(self) -> str:
        """Expose the nested claim content used by screening prompts."""

        return self.claim_metadata.claim_content

    @property
    def evidence_sentences(self) -> list[str]:
        """Return supporting quotes as an empty list when evidence is absent."""

        return self.claim_metadata.evidence.claim_quotes or []


class ChunkPayload(BaseModel):
    """Document chunk payload as stored by the upstream extraction pipeline."""

    project_id: str
    document_id: str
    title: str

    chunk_content: str
    chunk_id: str
    previous_chunk_id: str | None = None
    next_chunk_id: str | None = None

    page_numbers: list[int] = Field(default_factory=list)
    chunk_type: str
    parent_chunk_id: str | None = None

    header_1: str | None = None
    header_2: str | None = None
    header_3: str | None = None

    toc_path: list[str] = Field(default_factory=list)
    all_subchapters: list[str] = Field(default_factory=list)

    asset_path: str | None = None
    caption: str | None = None
    summary: str | None = None
    description: str | None = None
    content: str | None = None
    footnote: str | None = None

    related_assets: list[Any] = Field(default_factory=list)
    related_text: list[Any] = Field(default_factory=list)

    focus_topic: str
    wildlife_mentioned: bool = False
    plant_species_mentioned: bool = False

    wildlife_species: list[str] = Field(default_factory=list)
    plant_species: list[str] = Field(default_factory=list)

    map_scale: str | None = None
    hypothetical_questions: list[str] = Field(default_factory=list)
    vector: list[float] | None = None


class ClaimContext(BaseModel):
    """Lightweight subset of payload fields provided to the LLM prompts."""

    claim_id: str
    chunk_id: str
    claim_text: str
    chunk_text: str
