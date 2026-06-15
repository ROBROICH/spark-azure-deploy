from uuid import UUID

from pydantic import BaseModel, Field

from src.workflows.mvp.types import MVPWorkflowOutput


class BatchMVPWorkflowInput(BaseModel):
    project_id: UUID


class TopicNormRef(BaseModel):
    owner_node_type: str
    owner_node_id: str
    topic_norm_id: str


class NormRef(BaseModel):
    jurabk: str
    paragraph_nr: str
    topic_norms: list[TopicNormRef] = Field(default_factory=list)


class CachedNormDeconstructionBatchInput(BaseModel):
    project_id: UUID
    norms: list[NormRef]


class CachedNormDeconstructionBatchOutput(BaseModel):
    results: list[MVPWorkflowOutput]
    uncached_norms: list[NormRef]


class BatchMVPWorkflowOutput(BaseModel):
    project_id: UUID
    results: list[MVPWorkflowOutput]
