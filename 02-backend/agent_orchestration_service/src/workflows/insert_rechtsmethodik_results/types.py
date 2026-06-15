from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput


class InsertRechtsmethodikResultsInput(BaseModel):
    project_id: UUID
    norm_results: list[RechtsmethodikWorkflowOutput]


class WriteRechtsmethodikResultInput(BaseModel):
    project_id: UUID
    inserts: list[dict[str, Any]] = Field(default_factory=list)
    updates: list[dict[str, Any]] = Field(default_factory=list)
    gesetz_id: UUID
    norm_id: UUID


class InsertRechtsmethodikResultOutput(BaseModel):
    gesetz_id: UUID | None
    norm_id: UUID | None
    skipped: bool
    nodes_inserted: int


class ExaminationRechtsmethodikContext(BaseModel):
    gesetze: list[dict[str, Any]] = Field(default_factory=list)
    norms: list[dict[str, Any]] = Field(default_factory=list)
    absaetze: list[dict[str, Any]] = Field(default_factory=list)
    saetze: list[dict[str, Any]] = Field(default_factory=list)
