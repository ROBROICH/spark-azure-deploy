from pydantic import BaseModel, Field


class InconsistencyPair(BaseModel):
    """Edge evidence connecting two chunks that appear inconsistent."""

    chunk_a_id: str = Field(description="Chunk ID for one side of the contradiction.")
    chunk_b_id: str = Field(description="Chunk ID for the opposite side.")
    chunk_a_document_id: str = Field(description="Raw source document ID for chunk A (Qdrant `source_file_id`).")
    chunk_b_document_id: str = Field(description="Raw source document ID for chunk B (Qdrant `source_file_id`).")
    claim_a_id: str = Field(description="Claim ID for one side of the contradiction.")
    claim_b_id: str = Field(description="Claim ID for the opposite side.")

    content_a_excerpt: str = Field(description="Supporting excerpt from chunk A.")
    content_b_excerpt: str = Field(description="Supporting excerpt from chunk B.")
    chunk_a_document_name: str | None = Field(
        default=None,
        description="Human-readable source document title for chunk A.",
    )
    chunk_b_document_name: str | None = Field(
        default=None,
        description="Human-readable source document title for chunk B.",
    )
    chunk_a_page_number: int | None = Field(
        default=None,
        description="Representative page number for chunk A.",
    )
    chunk_b_page_number: int | None = Field(
        default=None,
        description="Representative page number for chunk B.",
    )

    rating: int = Field(
        ge=0,
        le=100,
        description="Final context-checker rating for this inconsistency pair.",
    )
    title: str = Field(description="Short contradiction label.")
    explanation: str = Field(description="Context-checker explanation for this edge.")


class ClusteringInput(BaseModel):
    """Input for graph-based clustering of verified inconsistencies."""

    project_id: str = Field(description="Project scope for this clustering run.")
    document_id: str = Field(description="Document whose inconsistencies are clustered.")
    inconsistency_pairs: list[InconsistencyPair] = Field(
        description="Verified pairwise inconsistencies used as graph edges."
    )


class InconsistencyCluster(BaseModel):
    """One connected component of inconsistency edges (becomes one note)."""

    edges: list[InconsistencyPair] = Field(description="Contradiction edges belonging to this cluster.")


class InconsistencyClusters(BaseModel):
    """Connected inconsistency clusters of one document."""

    clusters: list[InconsistencyCluster] = Field(description="Connected components, one per note.")
