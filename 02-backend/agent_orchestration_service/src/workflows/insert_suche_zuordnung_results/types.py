from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.utils import WorkflowName
from temporal.workflows.modul_suche_und_zuordnung.types import (
    SatzOrchestratorWorkflowOutput,
)

SUCHE_ZUORDNUNG_INSERT_WORKFLOW_ID = WorkflowName("InsertSucheZuordnungResultsWorkflow")
TASK_QUEUE = "orchestration"


class InsertSucheZuordnungResultsInput(BaseModel):
    project_id: UUID
    satz_orchestrator_outputs: list[SatzOrchestratorWorkflowOutput]


class InsertSucheZuordnungResultsOutput(BaseModel):
    fundstellen_inserted: int = 0
    skipped: bool = False
    inserts: list[dict[str, Any]] = Field(default_factory=list)
