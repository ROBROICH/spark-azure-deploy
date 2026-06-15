from uuid import UUID

from pydantic import BaseModel

from src.models.schemas.shared import CamelConfig


class WorkflowResponse(BaseModel, CamelConfig):
    parent_job_id: str


class CancelWorkflowResponse(BaseModel, CamelConfig):
    workflow_id: str


class SucheZuordnungNormRequest(BaseModel, CamelConfig):
    project_id: str


class BatchMVPRequest(BaseModel, CamelConfig):
    project_id: UUID


class BewertungRequest(BaseModel, CamelConfig):
    project_id: UUID
    norm_id: UUID


class RisikohinweiseRequest(BaseModel, CamelConfig):
    vae_node_id: UUID
    project_id: UUID
