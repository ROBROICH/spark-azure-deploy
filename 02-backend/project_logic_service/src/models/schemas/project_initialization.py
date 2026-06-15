from pydantic import Field

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.shared_schemas import CamelConfig


class ProjectInitializationResponse(CamelConfig):
    """Response for ProjectInitialization."""

    message: str | None = None
    workflow_status: WorkflowStatusEnum = Field(..., description="Current status of the workflow")
