"""Pydantic schemas for EWMS workflow endpoints."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ── Endpoint 1: Argument Extraction ──────────────────────────────────────────


class Span(BaseModel):
    start_idx: int
    end_idx: int


class TextSegment(BaseModel):
    text: str
    span: Span


class ChunkInfo(BaseModel):
    chunk_id: str
    page_content: str
    page_numbers: list[int]


class ExtractedArgument(BaseModel):
    argument: TextSegment
    description: str
    context: TextSegment


class ChunkArguments(BaseModel):
    chunk: ChunkInfo
    arguments: list[ExtractedArgument]


class DocumentArguments(BaseModel):
    document_id: UUID
    document_name: str
    chunk_arguments: list[ChunkArguments]
    beteiligungs_eingang_markdown: str | None = None


class ArgumentExtractionRequest(BaseModel):
    document_arguments: list[DocumentArguments]


class ArgumentInsertResult(BaseModel):
    argument_id: UUID


class DocumentInsertResult(BaseModel):
    document_id: UUID
    beteiligungs_eingang_id: UUID
    arguments: list[ArgumentInsertResult]
    skipped: bool = False


class ArgumentExtractionResponse(BaseModel):
    results: list[DocumentInsertResult]


class ProcessedFileIdsResponse(BaseModel):
    file_ids: list[UUID]


# ── Endpoint 2: Classification ────────────────────────────────────────────────


class ClassifiedArgument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    argument_id: UUID
    topic_id: UUID
    sub_topic_id: UUID | None = None


class ClassificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classified_arguments: list[ClassifiedArgument]
    unclassified_argument_ids: list[UUID] = Field(default_factory=list)


class ClassificationResponse(BaseModel):
    updated_count: int


# ── Endpoint 3: Classification Failure ────────────────────────────────────────


class ClassificationFailedRequest(BaseModel):
    beteiligungs_eingang_ids: list[UUID]


class ClassificationFailedResponse(BaseModel):
    updated_count: int


# ── Endpoint 4: Injection Detection ──────────────────────────────────────────


class InjectionDetectedDocument(BaseModel):
    file_id: UUID
    document_name: str
    snippet: str | None = None


class InjectionDetectedRequest(BaseModel):
    documents: list[InjectionDetectedDocument]


class InjectionDetectedResponse(BaseModel):
    updated_count: int
