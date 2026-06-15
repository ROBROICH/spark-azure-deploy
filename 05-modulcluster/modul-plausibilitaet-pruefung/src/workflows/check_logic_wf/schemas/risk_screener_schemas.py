from pydantic import BaseModel, Field


class ScreeningCandidateBundle(BaseModel):
    """Data structure representing the input for one screening run of the RiskScreener LLM agent."""

    project_id: str = Field(description="Project scope used for Qdrant collections.")
    document_id: str = Field(description="Document containing the check claim.")
    chunk_id: str = Field(description="Chunk the check claim originated from.")
    claim_id: str = Field(description="ID of the claim currently being screened.")
    reference_claims: list[str] = Field(description="Candidate reference claim IDs evaluated against `claim_id`.")


class ScreeningHit(BaseModel):
    """Intermediate screening result indicating risky claim pairings."""

    claim_id: str = Field(description="Claim being screened.")
    reference_id: str = Field(description="Reference claim judged as potentially risky.")
    claim_chunk_id: str = Field(description="Chunk ID the check claim originated from.")
    reference_chunk_id: str = Field(description="Chunk ID the reference claim originated from.")
    rating: int = Field(
        ge=0,
        le=100,
        description="Risk score for the pair as returned by the screener LLM.",
    )
    note: str = Field(description="Compact handoff note for downstream context checking.")
    reasoning: str = Field(description="Detailed rationale for auditability and debugging.")


class RiskScreenerReferencePromptItem(BaseModel):
    """Prompt item for one reference claim in index-based form."""

    reference_id: int = Field(description="1-based index used in the prompt and LLM response.")
    claim_text: str = Field(description="Reference claim text shown to the LLM.")


class GroupedScreeningBundle(BaseModel):
    """Bundles screened in one LLM call.

    Primarily groups claims from the same chunk, but small leftover
    groups may be packed across chunk boundaries to fill the batch.
    Each bundle keeps its own reference set, so cross-chunk mixing
    does not affect evaluation correctness.
    """

    project_id: str = Field(description="Project scope used for Qdrant collections.")
    document_id: str = Field(description="Document containing the check claims.")
    bundles: list[ScreeningCandidateBundle] = Field(description="1-N bundles, preferring same-chunk grouping.")


class GroupedRiskScreenerPromptCheckClaim(BaseModel):
    """One check claim in a grouped prompt."""

    check_id: int = Field(description="1-based index identifying this check claim.")
    claim_text: str = Field(description="Text of the claim under evaluation.")
    reference_ids: list[int] = Field(description="Which reference_ids this claim should be checked against.")


class GroupedRiskScreenerPromptPayload(BaseModel):
    """Grouped prompt: multiple check claims + shared reference pool."""

    check_claims: list[GroupedRiskScreenerPromptCheckClaim] = Field(
        description="Check claims with their assigned reference IDs."
    )
    reference_claims: list[RiskScreenerReferencePromptItem] = Field(
        description="Global pool of reference claims."
    )


class GroupedScreeningResultItem(BaseModel):
    """One screening result for a specific check-reference pair."""

    check_id: int = Field(description="1-based index of the check claim.")
    reference_id: int = Field(description="1-based index of the reference claim.")
    rating: int = Field(ge=0, le=100, description="Risikobewertung (0..100).")
    note: str = Field(description="Kompakte Arbeitsnotiz (min. 1 Zeichen) für nachfolgende Kontextprüfung.")
    reasoning: str = Field(description="Begründung (min. 10 Zeichen) für die Risikobewertung.")


class GroupedRiskScreenerResponse(BaseModel):
    """Flat list of screening results from a grouped call."""

    results: list[GroupedScreeningResultItem] = Field(
        description="One entry per check-reference pair that was evaluated.",
    )


class DocumentBundleRequest(BaseModel):
    """Input for building screening bundles for all claims in a document at once."""

    project_id: str = Field(description="Project scope used for Qdrant collections.")
    document_id: str = Field(description="Document whose claims are screened.")
    claim_ids: list[str] = Field(description="Ordered list of claim IDs to build bundles for.")


class DocumentBundleResult(BaseModel):
    """Raw (pre-deduplication) screening bundles for all claims in a document."""

    bundles: list[ScreeningCandidateBundle] = Field(
        description="One bundle per claim in the same order as the input claim_ids."
    )


class ResolvedClaimData(BaseModel):
    """Minimal pre-fetched claim data needed for screening (avoids Qdrant call in LLM activity)."""

    claim_id: str = Field(description="Claim ID.")
    chunk_id: str = Field(description="Chunk ID the claim originated from.")
    claim_text: str = Field(description="Claim text to be used in the LLM prompt.")


class FetchScreeningPayloadsBatchInput(BaseModel):
    """Input for batch-fetching all claim payloads needed for a set of screening bundles."""

    project_id: str = Field(description="Project scope used for Qdrant collections.")
    bundles: list[GroupedScreeningBundle] = Field(description="All grouped bundles whose claims need fetching.")


class ResolvedGroupedScreeningBundle(BaseModel):
    """GroupedScreeningBundle with pre-resolved claim data — ready for pure LLM screening."""

    project_id: str = Field(description="Project scope used for Qdrant collections.")
    document_id: str = Field(description="Document containing the check claims.")
    bundles: list[ScreeningCandidateBundle] = Field(description="1-N bundles from the same chunk.")
    claim_payloads: dict[str, ResolvedClaimData] = Field(
        description="Pre-fetched claim payloads keyed by claim_id."
    )
