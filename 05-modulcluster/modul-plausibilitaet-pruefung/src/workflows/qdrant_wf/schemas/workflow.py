"""Schemas shared by claim-extraction workflows and activities."""

from pydantic import BaseModel

from src.qdrant.schemas import ChunkPayload, ClaimPayload


class DocumentActivityInput(BaseModel):
    """Identifies one document within a project for Qdrant-related activities."""

    project_id: str
    document_id: str


class UploadClaimsInput(BaseModel):
    """Batch of extracted claims ready for Qdrant upload."""

    claims: list[ClaimPayload]


class ExtractionBatchInput(BaseModel):
    """Chunk batch sent to a child workflow for claim extraction."""

    project_id: str
    document_id: str
    is_erlaeuterungsbericht: bool
    text_chunks: list[ChunkPayload]
    table_chunks: list[ChunkPayload]


class ExtractionBatchOutput(BaseModel):
    """Claims extracted from one child workflow batch."""

    claims: list[ClaimPayload]
