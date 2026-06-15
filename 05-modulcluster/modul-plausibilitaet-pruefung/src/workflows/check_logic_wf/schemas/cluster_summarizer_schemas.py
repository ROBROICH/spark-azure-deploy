from pydantic import BaseModel, Field

from src.workflows.check_logic_wf.schemas.output_schemas import Occurrence


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


class IndexedInconsistencyEdge(BaseModel):
    """Prompt-safe edge format using local integer node IDs instead of UUIDs."""

    node_a_idx: int = Field(description="Local node index for chunk A.")
    node_b_idx: int = Field(description="Local node index for chunk B.")

    content_a_excerpt: str = Field(description="Supporting excerpt for node A.")
    content_b_excerpt: str = Field(description="Supporting excerpt for node B.")

    title: str = Field(description="Short contradiction label for this edge.")
    explanation: str = Field(description="Explanation for this edge.")


class InconsistencyGraph(BaseModel):
    """Graph payload rendered into the summarizer prompt."""

    edges: list[IndexedInconsistencyEdge] = Field(description="Indexed contradiction edges in the cluster.")


class InconsistencyCluster(BaseModel):
    """One connected component of inconsistency edges to summarize."""

    edges: list[InconsistencyPair] = Field(description="Contradiction edges belonging to this cluster.")


class InconsistencyClusters(BaseModel):
    """Collection of connected inconsistency clusters for one workflow-scoped input document."""

    clusters: list[InconsistencyCluster] = Field(description="Connected components to summarize.")


class NodeStance(BaseModel):
    """A single node's position within a contradiction cluster."""

    node_idx: int = Field(description="Local node index this stance belongs to.")
    stance_text: str = Field(
        description="Short neutral description of what this content states.",
    )


class InconsistencySummaryLLMResponse(BaseModel):
    """Schema sent to the LLM as output_format — only fields the LLM should generate."""

    cluster_title: str = Field(
        description="Short headline for the contradiction cluster.",
    )
    cluster_explanation: str = Field(
        description="Consolidated explanation of the contradiction across stances.",
    )
    stances: list[NodeStance] = Field(
        description="List of node stances representing distinct positions found in the cluster."
    )


class InconsistencySummary(InconsistencySummaryLLMResponse):
    """Full model with post-processing fields populated by workflow code after LLM call."""

    rating: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Representative contradiction rating for this summarized cluster.",
    )
    occurrences: list[Occurrence] = Field(
        default_factory=list,
        description="Resolved occurrences enriched with document and page metadata.",
    )


class SummarizerResponse(BaseModel):
    """Response payload returned by the cluster summarizer LLM."""

    inconsistencies: list[InconsistencySummary] = Field(
        description="Summaries generated for the provided cluster graph."
    )
