import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from src.models.db_models import WorkflowStatus


class StatusRequest(BaseModel):
    workflow_id: str
    run_id: str
    workflow_type: str
    status: WorkflowStatus
    timestamp: datetime
    project_id: uuid.UUID | None = None
    project_version: int | None = None
    failure_message: str | None = Field(default=None, max_length=500)
    history_s3_key: str | None = None
