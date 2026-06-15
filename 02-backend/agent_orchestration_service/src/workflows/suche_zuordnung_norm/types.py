"""Types and constants for the SucheZuordnungNorm workflow.

These are local to the agent orchestration service. Shared types used by
modul-suche-und-zuordnung (NormData, Document, SatzOrchestratorWorkflowInput, etc.)
remain in the temporal shared package.
"""

from pydantic import BaseModel
from temporal.utils import WorkflowName
from temporal.workflows.modul_suche_und_zuordnung.types import (
    NormData,
    SatzOrchestratorWorkflowOutput,
)

SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID = WorkflowName("suche_zuordnung_norm")
TASK_QUEUE = "orchestration"


class SucheZuordnungNormWorkflowInput(BaseModel):
    project_id: str
    norm_id: str
    data: NormData | None = None  # if None, fetched from examination service at workflow start


class SucheZuordnungNormWorkflowOutput(BaseModel):
    norm: str
    satz_results: list[SatzOrchestratorWorkflowOutput]
