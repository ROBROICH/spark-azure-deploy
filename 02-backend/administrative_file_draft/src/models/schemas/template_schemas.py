import uuid

from pydantic import BaseModel, ConfigDict

from src.models.topic_enums import TopicEnum


class CreateTemplateRequest(BaseModel):
    name: str
    project_type_id: uuid.UUID


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    project_type_id: uuid.UUID
    version: int
    is_active: bool


class TemplateNodeInput(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    title: str
    topic: TopicEnum | None
    order: float = 0
    text: str | None = ""
    is_hidden: bool = False
    can_add_child: bool = False


class TopicModel(BaseModel):
    id: uuid.UUID
    name: str


class AssignTemplateRequest(BaseModel):
    topics: list[TopicModel]
