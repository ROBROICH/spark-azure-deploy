"""Public Input/Output types for the NormErmittlung workflow.

These types form the contract between the normermittlung module and any
external caller (backend, other modules).  Internal activity I/O types
stay inside the module itself.
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class NormInput(BaseModel):
    """Pre-resolved norm data provided by the caller.

    Contains all information needed for evaluation — no external DB lookups
    required at workflow runtime.
    """

    model_config = ConfigDict(frozen=True)
    jurabk: str = Field(..., description="Legal abbreviation, e.g. 'BImSchG'.")
    paragraph_nr: str = Field(..., description="Paragraph number, e.g. '5'.")
    text: str = Field(..., description="Full paragraph text.")
    hierarchy: str = Field(..., description="Legal hierarchy level: 'eu', 'bund', 'bundesland', or 'kommune'.")
    bundesland: Optional[str] = Field(
        None,
        description="Full state name (e.g. 'Bayern', 'Nordrhein-Westfalen'). None for EU/Bund.",
    )
    ausfertigung_datum: Optional[str] = Field(None, description="Date of enactment (ISO format).")
    neufassung_datum: Optional[str] = Field(None, description="Date of last recast (ISO format).")
    letzte_aenderung_datum: Optional[str] = Field(None, description="Date of last amendment (ISO format).")
    regelungsgegenstand: Optional[str] = Field(
        None,
        description="Subject matter of the norm. None triggers LLM fallback in the workflow.",
    )


# Backward-compatible alias (deprecated — use NormInput instead)
StartNormRef = NormInput


class NormEvalResult(BaseModel):
    """Result of a single norm applicability evaluation.

    Carries the full norm data so downstream consumers (e.g. collision
    resolution) can use it directly without re-fetching from Qdrant.
    """

    norm_id: str
    jurabk: str
    paragraph_nr: str
    applicable: bool
    reason: str = ""
    text: str = ""
    hierarchy: str = ""
    location: str = ""
    regelungsgegenstand: str = ""
    effective_date: Optional[str] = None
    neufassung_datum: Optional[str] = None
    letzte_aenderung_datum: Optional[str] = None
    sachverhalt_text: str = ""
    sachverhalt_id: str = ""


class CollisionPairResult(BaseModel):
    """Result of resolving a single norm pair collision."""

    norm1_id: str
    norm2_id: str
    winner_norm_id: Optional[str] = None
    loser_norm_id: Optional[str] = None
    collision_type: Optional[str] = None
    reason: str = ""
    log: str = ""


class CollisionResult(BaseModel):
    """Output of the NormKollisionWorkflow (collision resolution)."""

    resolved_collisions: List[CollisionPairResult] = Field(default_factory=list)
    collision_count: int = 0
    total_pairs_checked: int = 0
    loser_norm_ids: List[str] = Field(
        default_factory=list,
        description="Norm IDs that lost in collision resolution (to be excluded).",
    )


class NormErmittlungInput(BaseModel):
    """Input schema for the main NormErmittlung workflow."""

    project_id: str = Field(..., description="UUID of the project to evaluate.")
    norms: List[NormInput] = Field(
        ..., description="List of pre-resolved legal norms to evaluate.", min_length=1,
    )
    place: str = Field(..., description="Project location (e.g. 'Düsseldorf, Nordrhein-Westfalen').")
    date: str = Field(..., description="Project entry date (ISO format, e.g. '2024-06-15').")


class NormSelectionResult(BaseModel):
    """Final output of the NormErmittlung workflow."""

    applicable_norms: List[NormEvalResult] = Field(default_factory=list)
    total_norms_evaluated: int = 0
    total_laws_filtered: int = 0
    collision_result: Optional[CollisionResult] = None
    final_norms: List[NormEvalResult] = Field(
        default_factory=list,
        description="Norms after collision resolution (losers removed).",
    )
