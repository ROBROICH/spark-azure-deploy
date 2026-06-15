from uuid import UUID

from pydantic import BaseModel


class MVPWorkflowInput(BaseModel):
    project_id: UUID
    jurabk: str
    paragraph_nr: str


class MVPWorkflowOutput(BaseModel):
    project_id: UUID
    jurabk: str
    paragraph_nr: str
    skipped: bool = False
    gesetz_id: UUID | None = None
    norm_id: UUID | None = None
