"""Activity I/O models for Qdrant operations."""

from __future__ import annotations

from pydantic import BaseModel

from src.schemas import ProcessedDocument
from src.workflows.qdrant.schemas import (
    ChunkMetadata,
    ParentChunkMetadata,
    QdrantDocumentContext,
    QuestionMetadata,
    SummaryMetadata,
)

__all__ = [
    "EmbeddedChunk",
    "EmbeddedQuestion",
    "EmbeddedSummary",
    "QdrantDocumentInput",
    "QdrantExtractionFile",
    "QdrantPreparedData",
    "QdrantUploadInput",
]


class QdrantExtractionFile(BaseModel):
    """A _processed.json file found in DMS."""

    extraction_file_id: str  # DMS file_id of the _processed.json
    filename: str
    project_id: str


class QdrantDocumentInput(BaseModel):
    """Input for the prepare_qdrant_data activity."""

    extraction_file_id: str  # DMS file_id of _processed.json
    project_id: str
    processed_document: ProcessedDocument | None = None


# ---------------------------------------------------------------------------
# Transport wrappers — pair a metadata record with its dense vector
# ---------------------------------------------------------------------------


class EmbeddedChunk(BaseModel):
    """A chunk paired with its pre-computed dense embedding vector."""

    chunk: ChunkMetadata
    dense_vector: list[float]


class EmbeddedQuestion(BaseModel):
    """A hypothetical question paired with its pre-computed dense embedding vector."""

    question: QuestionMetadata
    dense_vector: list[float]


class EmbeddedSummary(BaseModel):
    """A document summary paired with its pre-computed dense embedding vector."""

    summary: SummaryMetadata
    dense_vector: list[float]


# ---------------------------------------------------------------------------
# Activity I/O for the prepare → embed → upload split
# ---------------------------------------------------------------------------


class QdrantPreparedData(BaseModel):
    """Output of the prepare activity — everything needed to embed and upload."""

    chunks: list[ChunkMetadata]
    questions: list[QuestionMetadata]
    summaries: list[SummaryMetadata]
    parent_chunks: list[ParentChunkMetadata]
    doc_context: QdrantDocumentContext
    avg_chunk_length: float
    avg_question_length: float


class QdrantUploadInput(BaseModel):
    """Input for the upload activity — pre-embedded data ready for Qdrant."""

    embedded_chunks: list[EmbeddedChunk]
    embedded_questions: list[EmbeddedQuestion]
    embedded_summaries: list[EmbeddedSummary]
    parent_chunks: list[ParentChunkMetadata]
    doc_context: QdrantDocumentContext
    avg_chunk_length: float
    avg_question_length: float
