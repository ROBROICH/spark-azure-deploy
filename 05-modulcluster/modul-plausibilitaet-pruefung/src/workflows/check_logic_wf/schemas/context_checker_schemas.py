from __future__ import annotations

from pydantic import BaseModel, Field

from src.dms.schemas import BaseMetadata, ProjectBaseMetadataStatus


class BuildChunkContextsInput(BaseModel):
    """Input for the ``build_chunk_contexts_batch`` activity."""

    project_id: str
    chunk_ids: list[str]


class ContextCheckerInput(BaseModel):
    """Input for context-level conflict checking of one claim pair."""

    project_id: str = Field(description="Project scope used for DMS/Qdrant lookups.")
    document_id: str = Field(description="Document currently being processed.")
    claim_id: str = Field(description="Primary claim ID from risk screening.")
    reference_claim_id: str = Field(description="Reference claim ID from risk screening.")
    screening_note: str = Field(description="Screener note used as a weak hint for contextual verification.")


class ChunkWithContext(BaseModel):
    """Chunk text plus bounded neighboring context used by the LLM."""

    document_id: str = Field(
        description="Identifier of the raw source document containing the base chunk (Qdrant `source_file_id`)."
    )
    chunk_text: str = Field(description="Main chunk content containing the claim.")
    preceding_text: str = Field(description="Concatenated preceding context in document reading order.")
    following_text: str = Field(description="Concatenated following context.")
    page_numbers: list[int] = Field(description="Page numbers associated with the base chunk.")
    document_name: str | None = Field(description="Human-readable source document title, if available.")
    toc_path: list[str] | None = Field(
        description="TOC path of the base chunk used for section-aware context filtering."
    )


class ContextCheckerLLMInput(BaseModel):
    """Prompt payload for the first-pass conflict checker LLM."""

    project_base_md: BaseMetadata = Field(
        description="Project metadata constraints relevant for contradiction checking."
    )
    project_base_md_status: ProjectBaseMetadataStatus = Field(
        description="Whether project metadata is complete or an explicit unknown fallback."
    )
    chunk_a: ChunkWithContext = Field(description="Context window for the first claim.")
    chunk_b: ChunkWithContext = Field(description="Context window for the second claim.")
    screening_note: str = Field(description="Screener handoff note.")


class ContextCheckVerdict(BaseModel):
    """Contradiction verdict produced by checker or verifier LLM."""

    rating: int = Field(
        ge=0,
        le=100,
        description="Contradiction severity between the two claims (0 = none, 100 = strong).",
    )
    title: str = Field(
        description="Short title (max 200 chars) describing the identified contradiction.",
    )
    explanation: str = Field(
        description="Detailed reasoning from the LLM about the identified contradiction. Min 20 Chars",
    )
    chunk_a_excerpt: str = Field(
        description="Short excerpt from chunk_a that contains the relevant information for the contradiction. Min 20 Chars",
    )
    chunk_b_excerpt: str = Field(
        description="Short excerpt from chunk_b that contains the relevant information for the contradiction. Min 20 Chars",
    )


class ConflictCheckerLLMOutput(BaseModel):
    """LLM output for the combined conflict checker with integrated self-audit."""

    rating: int = Field(ge=0, le=100, description="Final audited conflict severity (0 = none, 100 = strong).")
    title: str = Field(
        description="Short title (max 200 chars) describing the identified conflict.",
    )
    explanation: str = Field(
        description="Audited reasoning for the conflict assessment. Min. 20 chars.",
    )
    chunk_a_excerpt: str = Field(
        description="Short wörtliches Zitat from chunk_a supporting the verdict. Min 20 Chars",
    )
    chunk_b_excerpt: str = Field(
        description="Short wörtliches Zitat from chunk_b supporting the verdict. Min 20 Chars",
    )
    audit_explanation: str = Field(
        description="Selbst-Audit: Welche Prüfungen durchgeführt wurden, ob Excerpts/Explanation korrigiert wurden, und warum das finale Rating so ausfällt. Min 20 chars.",
    )


class ContextCheckerOutput(BaseModel):
    """Result of context checking and optional verification for one claim pair."""

    chunk_a_id: str = Field(description="Chunk ID for the primary claim.")
    chunk_b_id: str = Field(description="Chunk ID for the reference claim.")
    claim_a_id: str = Field(description="Claim ID for the primary claim (echoed from input).")
    claim_b_id: str = Field(description="Claim ID for the reference claim (echoed from input).")

    chunk_a_context: ChunkWithContext = Field(description="Full context payload for chunk A (traceability/auditing).")
    chunk_b_context: ChunkWithContext = Field(description="Full context payload for chunk B (traceability/auditing).")

    verdict: ContextCheckVerdict = Field(description="Audited conflict verdict from the combined checker.")

    is_inconsistency: bool = Field(
        description="Whether the verdict rating meets the configured threshold for a reportable inconsistency."
    )

    audit_explanation: str = Field(
        description="Self-audit trace: which checks were applied and whether the verdict was adjusted.",
    )

    screening_note: str = Field(
        description=("Original screener note included for traceability; not a reliable decision signal by itself.")
    )
