from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.workflows.inhaltsextraktion.types import DocumentTopic

from src.models.schemas.temporal.diplan import DiPlanFolderInformation


class FVPWorkflowRequest(BaseModel):
    project_id: str


class FVPWorkflowArgs(BaseModel):
    project_id: str


class DocumentTypeDefinition(BaseModel):
    category: str | None = Field(None)
    document_type_name: str
    document_type_description: str


class FullFVPWorkflowInput(BaseModel):
    project_id: str
    file_ids: list[str]
    candidate_file_ids: list[str] = Field(default_factory=list)
    dokument_id_by_file_id: dict[str, str] = Field(default_factory=dict)
    has_toc_document: bool = False
    incremental: bool = False
    topics: list[DocumentTopic]
    document_types: list[DocumentTypeDefinition] | list[DiPlanFolderInformation]
    diplan_preprocessing: bool = False


class FVPExtractionWorkflowResultItem(BaseModel):
    workflow_type: str
    result: dict[str, Any] | None = None
    error: str | None = None


class FVPExtractionWorkflowResult(BaseModel):
    results: list[FVPExtractionWorkflowResultItem]


class TOCMatchingWorkflowArgs(BaseModel):
    project_id: str


class SendTOCMatchingResultsActivityArgs(BaseModel):
    project_id: str
    file_id: str


class TemplateDocumentTypeResponse(BaseModel):
    """A template document type with its category, used for listing required documents."""

    category: str
    document_type_id: UUID
    document_type_name: str
    document_type_description: str
    expected_count: int | None
