from uuid import UUID

from pydantic import BaseModel
from temporal.utils import WorkflowName
from temporal.workflows.bewertung.types import (
    AtomaresTBM,
    BewertungsWorkflowOutput,
    Rechtsfolge,
)

BEWERTUNG_WORKFLOW_ID = WorkflowName("bewertung")

# ── Orchestrator (parent) ──────────────────────────────────────


class BewertungInput(BaseModel):
    """API-facing input: which norm to assess."""

    project_id: UUID
    norm_id: UUID


class BewertungOutput(BaseModel):
    """Final output of the full pipeline."""

    project_id: UUID
    norm_id: UUID
    satz_results: list["InsertBewertungSatzOutput"]


# ── Gather activity input ─────────────────────────────────────


class GatherNormContextInput(BaseModel):
    """Single-model input for the gather activity."""

    project_id: UUID
    norm_id: UUID


# ── Shared: NormContext (produced by gather, consumed by process) ─


class FundstelleContext(BaseModel):
    """Fundstelle data needed to build Originaltext for modul-bewertung."""

    id: str
    dokument_id: str
    title: str
    text: str
    chunk_ids: list[str] = []
    page_numbers: list[int] = []


class SatzContext(BaseModel):
    satz_id: str
    satz_text: str
    norm_typ_lvl_1: str | None = None
    norm_typ_lvl_2: str | None = None
    atomare_tbm: list[AtomaresTBM]
    rechtsfolge: Rechtsfolge | None
    fundstellen: list[FundstelleContext]


class NormContext(BaseModel):
    """Full norm tree resolved from the examination service graph."""

    gesetz_name: str
    jurabk: str
    paragraph_nr: str
    paragraph_titel: str
    paragraph_text: str
    saetze: list[SatzContext]


# ── Child 1: Process ──────────────────────────────────────────


class ProcessBewertungenInput(BaseModel):
    norm_context: NormContext


class SatzBewertungResult(BaseModel):
    satz_id: str
    bewertung_output: BewertungsWorkflowOutput


class ProcessBewertungenOutput(BaseModel):
    satz_outputs: list[SatzBewertungResult]
    skipped_satz_ids: list[str] = []


# ── Child 2: Insert ───────────────────────────────────────────


class InsertBewertungInput(BaseModel):
    project_id: UUID
    satz_outputs: list[SatzBewertungResult]


class InsertBewertungSatzOutput(BaseModel):
    satz_id: str
    bewertung_id: str
    nodes_inserted: int
    skipped: bool


class InsertBewertungOutput(BaseModel):
    satz_results: list[InsertBewertungSatzOutput]
