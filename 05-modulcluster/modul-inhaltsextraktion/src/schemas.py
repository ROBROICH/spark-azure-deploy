"""
Shared Pydantic models used by workflows, activities, and processors.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field
from temporal import Base64Bytes
from temporal.workflows.inhaltsextraktion.types import BaseMetadata as BaseMetadata
from temporal.workflows.inhaltsextraktion.types import Chunk as Chunk
from temporal.workflows.inhaltsextraktion.types import ChunkEWMS as ChunkEWMS
from temporal.workflows.inhaltsextraktion.types import DocumentTopic as DocumentTopic
from temporal.workflows.inhaltsextraktion.types import DocumentTypeInfo as DocumentTypeInfo
from temporal.workflows.inhaltsextraktion.types import Metadata as Metadata
from temporal.workflows.inhaltsextraktion.types import PageIndexNode as PageIndexNode
from temporal.workflows.inhaltsextraktion.types import ProcessedDocument as ProcessedDocument
from temporal.workflows.inhaltsextraktion.types import SubChunk as SubChunk

from src.providers.base import ContentItemDict


class ExtractionOutput(BaseModel):
    """
    Unified output from any extraction provider.

    This is the canonical result type for document extraction activities.
    Contains markdown content, structural content list, and image references.

    Attributes:
        markdown: Extracted markdown content (custom format with <TABELLE>/<BILD> tags)
        content_list: Structural content list (unified format, used as Dict)
        image_bytes: Dict mapping image filenames to raw image bytes
        image_refs: Dict mapping image filenames to DMS file_ids (lightweight refs
            uploaded per-chunk during extraction to avoid carrying GB of image bytes
            through Temporal payloads). When populated, image_bytes may be empty.
    """

    markdown: str = ""
    content_list: list[ContentItemDict] = []
    image_bytes: dict[str, Base64Bytes] = {}
    image_refs: dict[str, str] = {}  # filename -> DMS file_id

class Topic(BaseModel):
    """Schema for a single topic."""

    id: int
    name: str
    description: str


class ProcessDocumentsDmsRequest(BaseModel):
    """Request model for processing documents via DMS."""

    file_ids: list[UUID] = Field(
        ...,
        description="List of DMS file IDs (UUIDs) to process.",
    )
    project_id: UUID = Field(
        ...,
        description="Project identifier (UUID).",
    )
