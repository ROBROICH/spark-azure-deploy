"""Schemas for the note-level stages behind the context checker.

A *Note* is one clustered contradiction with its evidence locations, verification and rubric scores.
"""

from __future__ import annotations

import functools
from typing import Literal

from pydantic import BaseModel, Field, create_model

from src.workflows.check_logic_wf.schemas.clustering_schemas import InconsistencyPair

AnchorKind = Literal["exakt", "teilweise", "fragment", "fehlt"]
Verdict = Literal["echt", "falsch", "unklar"]
YesNoUnclear = Literal["ja", "nein", "unklar"]


# ---------------------------------------------------------------------------
# Page context (shared by the pre-filter and the rubric)
# ---------------------------------------------------------------------------


class PageKey(BaseModel):
    """Identifies one page of one raw source document."""

    document_id: str = Field(description="Raw source document ID (Qdrant `source_file_id`).")
    page: int = Field(description="1-based page number as stored in `page_numbers`.")

    @property
    def key(self) -> str:
        """Stable dictionary key."""
        return f"{self.document_id}#{self.page}"


class PageContext(BaseModel):
    """Full text of one page plus the structured instance identifiers found on it."""

    document_id: str
    page: int
    text: str = Field(description="Concatenated text of all chunks on this page (reading order).")
    toc_path: list[str] = Field(default_factory=list, description="TOC path of the first chunk on the page.")
    identifiers: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Template-instance identifiers by class (MASSNAHME, BW, STECKBRIEF, ...), see identifiers.template_identifiers.",
    )


class FetchPageContextsInput(BaseModel):
    """Input for the ``fetch_page_contexts_batch`` activity."""

    project_id: str
    keys: list[PageKey]


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------


class EvidenceLocation(BaseModel):
    """One evidence location of a note: excerpt plus carrier chunk and neighbourhood."""

    chunk_id: str
    document_id: str
    document_name: str | None = None
    page: int | None = None
    excerpt: str = Field(description="Verbatim excerpt chosen by the context checker.")
    anchor: AnchorKind = Field(description="How well the excerpt re-anchors in the carrier chunk text.")
    chunk_text: str = Field(default="", description="Carrier chunk text (bounded).")
    chunk_is_ai_text: bool = Field(default=False, description="Carrier chunk is an LLM summary of a non-text element.")
    toc_path: list[str] = Field(default_factory=list)
    prev_text: str = ""
    next_text: str = ""
    page_text: str = Field(default="", description="Full page text (rubric context); empty if unavailable.")
    objects: list[str] = Field(
        default_factory=list,
        description="Model-extracted object names of the claims behind this location (`objekt` captured at extraction).",
    )


class EvidenceSignals(BaseModel):
    """Deterministic evidence signals of the verification (facts only, no weights)."""

    anchor_fail_share: float
    ai_text_only: bool
    mojibake: bool
    version_pair: bool
    within_version_pair: bool
    superseded_doc: bool
    id_mismatch: bool
    id_shared: bool
    template_serial: bool
    profile_mismatch: bool
    same_id_conflict: bool
    status_conflict: bool
    current_page: bool
    name_conflict_same_values: bool
    numeric_conflict_same_id: bool
    wording_also_current: bool
    n_locations: int

    @property
    def referent_evidence(self) -> bool:
        """Machine-checkable 'same named object' evidence — required for the top tier."""
        return (
            self.same_id_conflict
            or self.status_conflict
            or self.numeric_conflict_same_id
            or self.name_conflict_same_values
        )

    @property
    def status_exception(self) -> bool:
        """Status contradiction with a counterpart in a current source is not a version artefact."""
        return self.status_conflict and self.current_page

    @property
    def version_artefact(self) -> bool:
        """Cross-version pair without any within-version conflict and without rescue."""
        return (
            self.version_pair
            and not self.within_version_pair
            and not self.wording_also_current
            and not self.status_exception
        )

    @property
    def hard_negative(self) -> bool:
        """Deterministically proven FP mechanism (information destroyed or version artefact)."""
        return (
            self.mojibake or self.ai_text_only or self.template_serial or self.profile_mismatch or self.version_artefact
        )


class Note(BaseModel):
    """One clustered contradiction prepared for note-level scoring."""

    note_id: str
    title: str = Field(description="Title of the strongest checker edge.")
    description: str = Field(description="Explanation of the strongest checker edge.")
    rating: int = Field(ge=0, le=100, description="Max context-checker rating over the cluster edges.")
    locations: list[EvidenceLocation]
    edges: list[InconsistencyPair]
    signals: EvidenceSignals
    score_det: float = Field(ge=0.0, le=100.0)
    evidence_block: str = Field(
        default="", description="Mechanically gathered corpus evidence for the verifier prompt."
    )
    gate_reason: str | None = Field(default=None, description="Rubric gate rule that rejects the note, if any.")


class ChunkContextLite(BaseModel):
    """Chunk context fields the note builder needs (subset of ``ChunkWithContext``)."""

    document_id: str
    document_name: str | None
    chunk_text: str
    preceding_text: str
    following_text: str
    page_numbers: list[int]
    toc_path: list[str]


class BuildNotesInput(BaseModel):
    """Input for the ``build_notes`` activity."""

    project_id: str
    document_id: str
    clusters: list[list[InconsistencyPair]]
    chunk_contexts: dict[str, ChunkContextLite]


# ---------------------------------------------------------------------------
# LLM outputs
# ---------------------------------------------------------------------------


class VerifierVote(BaseModel):
    """One vote of the adversarial verifier."""

    urteil: Verdict = Field(description="echt | falsch | unklar")
    kategorie: str = Field(description="Greifender Auflösungsweg oder 'kein'.")
    grund: str = Field(description="1-2 Sätze mit wörtlichem Beleg.")


class WeightedVote(BaseModel):
    """Vote with its weight (1.0 base pass, 2.0 escalation pass) and stage label."""

    stage: Literal["basis", "eskalation"]
    weight: float
    urteil: Verdict
    kategorie: str
    grund: str


class RubricLocation(BaseModel):
    """Extraction for one text location."""

    rolle: str = Field(
        description="sachaussage | formularoption | legende | ueberschrift | planbeschriftung | methodik | schriftfeld"
    )
    gegenstand: str = Field(description="Wörtlicher Ausschnitt, der das Objekt benennt (max. 70 Zeichen) oder ''.")
    merkmal: str = Field(description="Wörtlicher Ausschnitt, der die Messgröße/Eigenschaft benennt (max. 70 Zeichen).")
    wert: str = Field(description="Behaupteter Wert oder Kernaussage, wörtlich (max. 70 Zeichen).")
    bezugsrahmen: str = Field(description="Wörtliche Einschränkungen, durch ' | ' getrennt, oder ''.")


class RubricResponse(BaseModel):
    """Rubric output: per-location extractions plus two narrow note-level judgements.

    ``stellen[i]`` belongs to the i-th location of the prompt; the scorer relies on that
    index for its exclusion checks, so the count must match. Use :func:`rubric_response_for`
    to get the schema variant that enforces exactly ``n`` entries at the LLM boundary.
    """

    stellen: list[RubricLocation]
    gleicher_gegenstand: YesNoUnclear
    unvereinbar: YesNoUnclear
    begruendung: str


@functools.cache
def rubric_response_for(n: int) -> type[RubricResponse]:
    """``RubricResponse`` whose JSON schema requires exactly *n* ``stellen`` (constrained decoding + validation)."""
    return create_model(
        f"RubrikAntwort{n}",
        __base__=RubricResponse,
        stellen=(list[RubricLocation], Field(min_length=n, max_length=n)),
    )


class RubricScore(BaseModel):
    """Deterministic pairwise score of the rubric."""

    score: int = Field(ge=0, le=100)
    grund: str
    art: Literal["zahl", "qualitativ"] | None = Field(
        default=None, description="Top-tier kind: numeric conflict (95) or qualitative (86)."
    )
    evaluated: bool = Field(
        default=True,
        description=(
            "False when the rubric could not judge the note (rubric disabled, schema failure); "
            "a gate rejection is a judgement and stays True."
        ),
    )


class NoteScores(BaseModel):
    """All scores of one note after verification and rubric ran."""

    note_id: str
    score_a: float = Field(ge=0.0, le=100.0)
    score_b: float | None = Field(default=None, ge=0.0, le=100.0, description="None when the rubric did not evaluate.")
    votes: list[WeightedVote] = Field(default_factory=list)
    rubric: RubricResponse | None = None
    rubric_score: RubricScore
    verifier_skipped: bool = False


class BuildNotesOutput(BaseModel):
    """Output of the ``build_notes`` activity."""

    notes: list[Note]
    pages: dict[str, PageContext] = Field(
        default_factory=dict, description="Page contexts of all note locations, keyed by PageKey.key."
    )
