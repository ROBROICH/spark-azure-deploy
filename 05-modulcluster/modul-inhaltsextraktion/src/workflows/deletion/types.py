"""Pydantic types for document deletion workflows and activities."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DeletionFileInfo(BaseModel):
    """Simplified file info used by deletion activities and workflows."""

    file_id: str = Field(description="Unique identifier of the file in DMS.")
    filename: str = Field(description="Original filename or relative extraction path in DMS.")
    file_type: str = Field(description="DMS file type, for example document or content_extraction.")

    @classmethod
    def from_dict(cls, file_obj: dict[str, Any]) -> "DeletionFileInfo":
        """Create a DeletionFileInfo instance from a plain file dict."""
        return cls(
            file_id=str(file_obj["id"]),
            filename=file_obj["filename"],
            file_type=file_obj.get("type", ""),
        )


class DMSDeleteSingleDocumentInput(BaseModel):
    """Input for deleting one document and its related extraction files."""

    project_id: UUID = Field(description="Unique identifier of the project.")
    document_file: DeletionFileInfo = Field(description="The selected document file to delete.")
    existing_content_extractions: list[DeletionFileInfo] = Field(
        default_factory=list,
        description="All existing content_extraction files of the project used to find derived files for deletion.",
    )


class DMSDeleteSingleDocumentResult(BaseModel):
    """Result of deleting one document and its related DMS files."""

    document_filename: str = Field(description="Filename of the document that was requested for deletion.")
    documents_deleted: list[str] = Field(
        default_factory=list,
        description="Document filenames successfully deleted from DMS.",
    )
    documents_failed: list[str] = Field(
        default_factory=list,
        description="Document filenames that failed to be deleted from DMS.",
    )
    content_extractions_deleted: list[str] = Field(
        default_factory=list,
        description="Derived content_extraction filenames successfully deleted from DMS.",
    )
    content_extractions_failed: list[str] = Field(
        default_factory=list,
        description="Derived content_extraction filenames that failed to be deleted from DMS.",
    )


class UpdateSummaryInput(BaseModel):
    """Input for updating summary.json after deleting selected documents."""

    project_id: UUID = Field(description="Unique identifier of the project.")
    deleted_document_filenames: list[str] = Field(
        default_factory=list,
        description="Document filenames that should be removed from summary.json.",
    )


class UpdateSummaryResult(BaseModel):
    """Output for updating summary.json after deleting selected documents."""

    success: list[str] = Field(
        default_factory=list,
        description="Document filenames successfully removed from summary.json.",
    )
    failed: list[str] = Field(
        default_factory=list,
        description="Document filenames that could not be removed from summary.json.",
    )


class QdrantDocumentDeleteInput(BaseModel):
    """Input for deleting Qdrant points belonging to a single source file."""

    project_id: UUID = Field(description="Unique identifier of the project.")
    document_file: DeletionFileInfo = Field(
        description="The source document whose Qdrant points should be soft-deleted."
    )


class CleanupContentExtractionsInput(BaseModel):
    """Input for deleting old derived outputs of a document by filename."""

    project_id: UUID = Field(description="Unique identifier of the project.")
    filename: str = Field(description="Original document filename whose derived outputs should be cleaned up.")


class CleanupContentExtractionsResult(BaseModel):
    """Result of deleting old derived outputs of a document by filename."""

    content_extractions_deleted: list[str] = Field(
        default_factory=list,
        description="Derived content_extraction filenames successfully deleted from DMS.",
    )
    content_extractions_failed: list[str] = Field(
        default_factory=list,
        description="Derived content_extraction filenames that failed to be deleted from DMS.",
    )
    summary_update_success: list[str] = Field(
        default_factory=list,
        description="Document filenames successfully removed from summary.json during cleanup.",
    )
    summary_update_failed: list[str] = Field(
        default_factory=list,
        description="Document filenames that could not be removed from summary.json during cleanup.",
    )
