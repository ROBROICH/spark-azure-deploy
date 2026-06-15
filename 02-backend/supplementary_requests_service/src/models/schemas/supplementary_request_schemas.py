"""Pydantic schemas for supplementary requests."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.models.db.enums import Priority, SourceType


class SourceRef(BaseModel):
    """Nested source reference object."""

    type: SourceType
    item_id: str = Field(..., min_length=1, max_length=255)


class CreateSupplementaryRequestRequest(BaseModel):
    """Schema for creating a supplementary request."""

    # process_step is intentionally absent from the public API. The legacy DB
    # column is still persisted internally for old data until it can be removed.
    title: str = Field(..., min_length=1, max_length=2000)
    reason: str = Field(default="", max_length=2000)
    priority: Priority
    source_ref: SourceRef | None = None
    included_in_letter: bool = Field(default=False)
    topic_id: UUID | None = None
    document_id: UUID | None = None


class UpdateSupplementaryRequestRequest(BaseModel):
    """Schema for updating a supplementary request (partial)."""

    title: str | None = Field(None, min_length=1, max_length=2000)
    reason: str | None = Field(None, max_length=2000)
    priority: Priority | None = None
    source_ref: SourceRef | None = None
    included_in_letter: bool | None = None
    topic_id: UUID | None = None
    document_id: UUID | None = None


class SupplementaryRequestResponse(BaseModel):
    """Schema for supplementary request response."""

    id: UUID
    project_id: UUID
    title: str
    reason: str
    priority: Priority
    source_ref: SourceRef | None = None
    included_in_letter: bool
    topic_id: UUID | None = None
    document_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def assemble_source_ref(cls, data: Any) -> Any:
        """Convert flat DB columns source_type/source_item_id into nested source_ref."""
        if isinstance(data, Mapping):
            return data

        if hasattr(data, "__dict__"):
            source_type = getattr(data, "source_type", None)
            source_item_id = getattr(data, "source_item_id", None)
            if (source_type is None) != (source_item_id is None):
                raise ValueError("source_type and source_item_id must both be set or both be null")

            assembled_data = {
                field_name: getattr(data, field_name) for field_name in cls.model_fields if field_name != "source_ref"
            }
            assembled_data["source_ref"] = (
                {"type": source_type, "item_id": source_item_id} if source_type is not None else None
            )
            return assembled_data

        return data
