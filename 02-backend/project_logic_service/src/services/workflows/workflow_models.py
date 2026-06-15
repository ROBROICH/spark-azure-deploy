from uuid import UUID

from audit_client.workflow import WorkflowActorContext
from pydantic import BaseModel
from temporal.workflows.project_versioning.types import (
    CreateProjectVersionInput,
    CreateProjectVersionOutput,
    FileDiffEntry,
    FileDiffSummary,
)

from src.models.db.workflow_enum import WorkflowStatusEnum

__all__ = [
    "CreateProjectVersionInput",
    "CreateProjectVersionOutput",
    "DeleteProjectInput",
    "FileDiffEntry",
    "FileDiffSummary",
    "ProjectInitializationInput",
    "ProjectInitializationOutput",
]


class ProjectInitializationInput(BaseModel):
    project_id: UUID
    project_type_id: UUID
    project_version: int = 1


class DeleteProjectInput(BaseModel):
    project_id: UUID
    workflow_actor: WorkflowActorContext | None = None


class ProjectInitializationOutput(BaseModel):
    status: WorkflowStatusEnum
    message: str | None = None
