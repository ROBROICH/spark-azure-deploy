from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.db.topic_enum import TopicNormStatus, TopicNormType
from src.models.schemas.shared_schemas import CamelConfig


class TopicResponse(CamelConfig):
    """Response model for topic metadata."""

    id: UUID = Field(...)
    project_id: UUID = Field(..., description="The owning project ID")
    parent_topic_id: UUID | None = Field(None, description="The ID of a parent topic")
    name: str = Field(..., description="The name of the topic")
    description: str | None = Field(None, description="Optional description of the topic")
    show_in_mvp: bool = Field(..., description="Whether the topic is shown in MVP")
    show_in_ewm: bool = Field(..., description="Whether the topic is shown in EWM")
    show_in_beschluss: bool = Field(..., description="Whether the topic is shown in Beschluss")
    is_deleted: bool = Field(..., description="Whether the topic is deleted")
    created_at: datetime = Field(..., description="The time the topic was created")
    updated_at: datetime = Field(..., description="The time the topic was updated")


class TopicNormResponse(CamelConfig):
    """Response model for topic norm metadata."""

    id: UUID = Field(..., description="The ID of the topic norm")
    topic_id: UUID = Field(..., description="The ID of the topic")
    type: TopicNormType = Field(..., description="The type of the norm")
    project_id: UUID = Field(..., description="The ID of the associated project")
    project_version: int = Field(..., description="The project version of the topic norm")
    jurabk: str = Field(..., description="The legal code (Jurabk)")
    paragraph_nr: str = Field(..., description="The paragraph number (ParagraphNr)")
    absatz: str | None = Field(None, description="Optional Absatz discriminator")
    satz: str | None = Field(None, description="Optional Satz discriminator")
    nummer: str | None = Field(None, description="Optional Nummer discriminator")
    mvp_status: TopicNormStatus = Field(..., description="MVP review status for this topic norm")
    satz_statuses: dict[str, TopicNormStatus] = Field(
        ..., description="RPB per-Satz review statuses keyed by Satz node ID"
    )


class CreateTopicRequest(BaseModel):
    """Pydantic model for create topic request."""

    project_id: UUID = Field(..., description="The owning project ID")
    name: str = Field(..., description="The name of the topic")
    description: str | None = Field(None, description="Optional description of the topic")
    parent_topic_id: UUID | None = Field(None, description="The ID of a parent topic")
    show_in_mvp: bool = Field(True, description="Whether the topic is shown in MVP")
    show_in_ewm: bool = Field(True, description="Whether the topic is shown in EWM")
    show_in_beschluss: bool = Field(True, description="Whether the topic is shown in Beschluss")

    model_config = ConfigDict(
        **CamelConfig.model_config,
        json_schema_extra={
            "examples": [
                {
                    "projectId": "550e8400-e29b-41d4-a716-446655440000",
                    "name": "Nature Conservation",
                    "description": None,
                }
            ]
        },
    )


class UpdateTopicRequest(BaseModel):
    """Pydantic model for updated deadline metadata."""

    name: str = Field(..., description="The name of the topic")
    description: str | None = Field(None, description="Optional description of the topic")
    parent_topic_id: UUID | None = Field(None, description="The ID of a parent topic")
    show_in_mvp: bool | None = Field(None, description="Whether the topic is shown in MVP")
    show_in_ewm: bool | None = Field(None, description="Whether the topic is shown in EWM")
    show_in_beschluss: bool | None = Field(None, description="Whether the topic is shown in Beschluss")

    model_config = ConfigDict(
        **CamelConfig.model_config,
        json_schema_extra={
            "examples": [
                {
                    "description": "Description",
                    "name": "Nature Conservation",
                }
            ]
        },
    )
