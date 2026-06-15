"""EWMS request schemas for service-to-service calls."""

from uuid import UUID

from pydantic import BaseModel, Field


class ClassifiedArgumentRequest(BaseModel):
    argument_id: UUID
    topic_id: UUID
    sub_topic_id: UUID | None = None


class ClassificationRequest(BaseModel):
    classified_arguments: list[ClassifiedArgumentRequest]
    unclassified_argument_ids: list[UUID] = Field(default_factory=list)


class InjectionDetectedDocument(BaseModel):
    file_id: UUID
    document_name: str
    snippet: str | None = None


class InjectionDetectedRequest(BaseModel):
    documents: list[InjectionDetectedDocument]
