"""Response types for PageIndex LLM summarization."""

from pydantic import BaseModel


class NodeSummaryResponse(BaseModel):
    """LLM response containing a single node summary."""

    summary: str


class RecursiveSummaryResponse(BaseModel):
    """LLM response containing recursive node summaries."""

    summary: str
