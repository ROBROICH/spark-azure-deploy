from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from src.models.schemas.shared import CamelConfig


class TopicResponse(BaseModel, CamelConfig):
    """Response model for topic metadata."""

    id: UUID = Field(...)
    project_id: UUID = Field(..., description="The owning project ID")
    parent_topic_id: UUID | None = Field(None, description="The ID of a parent topic")
    name: str = Field(..., description="The name of the topic")
    description: str | None = Field(None, description="Optional description of the topic")
    is_deleted: bool = Field(..., description="Whether the topic is deleted")
    created_at: datetime = Field(..., description="The time the topic was created")
    updated_at: datetime = Field(..., description="The time the topic was updated")
