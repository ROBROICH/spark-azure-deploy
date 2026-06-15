"""Shared Workflow-Typen für den Bewertungs-Workflow.

Nur extern aufrufbare Workflow-I/O-Typen — interne Child-Workflow-Typen
bleiben im Modul unter src/models/.
"""

from typing import Optional

from pydantic import BaseModel, Field

from temporal.workflows.rechtsmethodik.types import AtomaresTBM, Rechtsfolge


class Originaltext(BaseModel):
    """Ein SVM-Chunk mit node_id, title und text."""
    document_id: str
    node_id: str
    title: str
    text: str
    chunk_ids: list[str] = Field(default_factory=list)
    page_numbers: list[int] = Field(default_factory=list)


class BewertungsWorkflowInput(BaseModel):
    """Input für den Bewertungs-Workflow. Input ist ein Satz aus einer Norm, ergänzt um die zugehörigen Originaltexte (SVM-Chunks) und Rechtsmethodik-Infos."""
    # Aus Rechtsmethodik
    gesetz: str
    jurabk: str
    paragraph_nr: str
    paragraph_title: str
    paragraph_text: str
    satz_id: str
    satz_text: str
    rechtsfolge: Optional[Rechtsfolge] = None
    atomare_tbm: Optional[list[AtomaresTBM]] = None
    # Aus SuZ
    research_report: Optional[str] = None
    originaltexte: list[Originaltext] = Field(min_length=1)


class PlanSubsection(BaseModel):
    """Unterkapitel eines Plankapitels."""

    titel: str
    fokus: str
    struktur: str | None = Field(
        default=None,
        description="Optionaler Strukturhinweis für den Writer – beschreibt den inneren Aufbau des Unterkapitels",
    )


class PlanSection(BaseModel):
    """Ein Kapitel im DetailedPlan."""

    titel: str
    ziel: str = Field(description="Internes Ziel für Writer – was soll erreicht werden?")
    svm_ids: list[str] = Field(min_length=1, description="Zugeordnete SVM-IDs (4-stellig)")
    unterkapitel: list[PlanSubsection] = Field(default_factory=list)


class DetailedPlan(BaseModel):
    """Strukturierter Bewertungsplan mit Kapiteln."""

    kapitel: list[PlanSection] = Field(min_length=3, max_length=12)


class Quelle(BaseModel):
    """Quellenreferenz für ein SVM-Chunk (ohne Volltext)."""
    document_id: str
    node_id: str
    title: str
    chunk_ids: list[str] = Field(default_factory=list)
    page_numbers: list[int] = Field(default_factory=list)


class KapitelOutput(BaseModel):
    """Einzelnes Kapitel im Output."""

    id: str = Field(description="Eindeutige UUID des Kapitels")
    titel: str
    markdown: str
    kurzform: str | None = None


class BewertungsWorkflowOutput(BaseModel):
    """Output des Bewertungs-Workflows."""

    id: str = Field(description="Eindeutige UUID des Bewertungsergebnisses")
    satz_id: str
    norm: str
    satz_text: str
    result: str = Field(description="erfuellt | nicht_erfuellt | nicht_beurteilbar")
    kurzform: str | None = Field(
        default=None,
        description="Kurzform der Gesamtbewertung im Urteilsstil",
    )
    kapitel: list[KapitelOutput] = Field(
        description="Kapitel-Ergebnisse mit titel, markdown, used_svm_ids",
    )
    full_text: str = Field(description="Vollständiger Markdown-Text der Bewertung")
    sources: dict[str, Quelle] = Field(
        default_factory=dict,
        description="SVM-ID → Quellenreferenz (document_id, node_id, title, chunk_ids, page_numbers)",
    )
