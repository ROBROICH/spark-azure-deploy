"""Schemas for Table of Content Notes."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic.config import ConfigDict


class TableContentNotesResponse(BaseModel):
    """Response schema for table of content notes."""

    id: UUID
    project_id: UUID
    content: str
    is_resolved: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateTableContentNoteRequest(BaseModel):
    """Request schema for creating a table of content note."""

    content: str = Field(..., description="The content of the table of content note")


class UpdateResolvedRequest(BaseModel):
    """Request schema for updating the resolved status of a note."""

    is_resolved: bool = Field(..., description="Whether the note has been resolved")


class TocJobDoneRequest(BaseModel):
    """Request payload for the toc notes results endpoint."""

    file_id: UUID


class TocJobStatus(str, Enum):
    """Allowed status values for TOC job processing."""

    SUCCESS = "success"
    NO_INHALTSVERZEICHNIS_FOUND = "no_inhaltsverzeichnis_found"


class TocJobDoneResponse(BaseModel):
    """Response for the toc notes results endpoint."""

    status: TocJobStatus
    notes_created: int
    matched_document_types_total: int
    unmatched_document_types: list[str]
    toc_document_id: UUID | None = None


class TocRequiredDocumentType(BaseModel):
    document_type_name: str

    model_config = ConfigDict(extra="ignore")


class TocMatchedDocumentType(BaseModel):
    required_document_type: TocRequiredDocumentType
    assigned_documents: list[object] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class TocMatchingOutput(BaseModel):
    matched_document_types: list[TocMatchedDocumentType]


class TocExtractionOutput(BaseModel):
    status: TocJobStatus
    metadata: dict[str, Any] | None = None

    model_config = ConfigDict(extra="ignore")


class TocResults(BaseModel):
    inhaltsverzeichnis_extraction_output: TocExtractionOutput
    inhaltsverzeichnis_matching_output: TocMatchingOutput


class TocNotesWithStatusResponse(BaseModel):
    """Response for GET toc-notes — includes job status and the note list."""

    status: TocJobStatus | None
    notes: list[TableContentNotesResponse]
