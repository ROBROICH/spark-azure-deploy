from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.workflows.inhaltsextraktion.types import ProcessedFileInfo


class InsertExtractionResultsInput(BaseModel):
    project_id: UUID
    processed_files: list[ProcessedFileInfo]
    dokument_id_by_file_id: dict[str, str] = Field(default_factory=dict)


class InsertDocumentExtractionInput(BaseModel):
    project_id: UUID
    processed_file_info: ProcessedFileInfo


class InsertDocumentExtractionOutput(BaseModel):
    dokument_id: UUID
    skipped: bool
    nodes_inserted: int


class DocumentExtractionEntry(BaseModel):
    """Pre-computed inserts + metadata for one document."""

    dokument_id: UUID
    source_file_id: UUID | None = None
    has_dokument_id_override: bool = False
    inserts: list[dict[str, Any]] = Field(default_factory=list)


class BatchInsertExtractionInput(BaseModel):
    project_id: UUID
    entries: list[DocumentExtractionEntry]


class BatchInsertExtractionOutput(BaseModel):
    results: list[InsertDocumentExtractionOutput]
