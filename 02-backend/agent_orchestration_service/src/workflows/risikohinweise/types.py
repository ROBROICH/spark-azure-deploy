from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.utils import WorkflowName

RISIKOHINWEISE_WORKFLOW_ID = WorkflowName("risikohinweise")


class RisikohinweiseWorkflowInput(BaseModel):
    project_id: UUID
    vae_node_id: UUID


class FetchRisikohinweisChapterInput(BaseModel):
    project_id: UUID
    vae_node_id: UUID


class AfdVaeNode(BaseModel):
    node_type: Literal["vae_node"]
    id: UUID
    title: str
    text: str
    order: float
    is_hidden: bool
    frontend_parent_ids: list[str] = []


class PersistedRisk(BaseModel):
    id: UUID
    vae_node_id: UUID
    problem: str
    recommendation: str | None = None
    quote: str | None = None
    severity: int = Field(..., ge=1, le=10)
    implication: str
    status: Literal["open", "corrected", "ignored"] | None = None


class ReplaceVaeNodeRisksInput(BaseModel):
    project_id: UUID
    vae_node_id: UUID
    risks: list[PersistedRisk]


class ReplaceProjectRisksOutput(BaseModel):
    deleted_count: int
    inserted_count: int


class RisikohinweiseWorkflowOutput(BaseModel):
    project_id: UUID
    chapters_processed: int
    risks_persisted: int


__all__ = [
    "RISIKOHINWEISE_WORKFLOW_ID",
    "AfdVaeNode",
    "FetchRisikohinweisChapterInput",
    "PersistedRisk",
    "ReplaceProjectRisksOutput",
    "ReplaceVaeNodeRisksInput",
    "RisikohinweiseWorkflowInput",
    "RisikohinweiseWorkflowOutput",
]
