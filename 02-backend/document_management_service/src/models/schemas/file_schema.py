from datetime import datetime
from pathlib import PurePosixPath
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipApprovalStatus


class CamelConfig:
    """Shared config for camelCase aliases and ORM mode."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        from_attributes=True,
        populate_by_name=True,
    )


# Scoping mixins
class ProjectScopedMixin(BaseModel):
    """Files that belong to a specific project."""

    project_id: UUID = Field(..., description="ID of the project")


class OptionalProjectScopedMixin(BaseModel):
    """Files that optionally belong to a specific project."""

    project_id: UUID | None = Field(None, description="ID of the project")


class TemporalScopedMixin(BaseModel):
    """Files scoped to a Temporal workflow execution."""

    workflow_id: str = Field(..., description="Temporal workflow ID")
    run_id: str = Field(..., description="Temporal run ID")


class BaseFileUpload(BaseModel):
    """Base model for upload requests."""

    filename: str = Field(..., description="File name")
    create_new_version: bool = Field(False, description="Create new version if file already exists")

    model_config = ConfigDict(
        **CamelConfig.model_config,
        json_schema_extra={
            "examples": [
                {
                    "type": "document",
                    "projectId": "00000000-0000-0000-0000-000000000000",
                    "filename": "contract.pdf",
                    "createNewVersion": False,
                }
            ]
        },
    )


# Concrete upload models
class ProjectDocumentUpload(BaseFileUpload, ProjectScopedMixin):
    """Presigned upload request for a project document."""

    type: Literal[FileTypeEnum.DOCUMENT.value] = Field(  # type: ignore
        ..., description="Must be 'document'"
    )


class ProjectZipUpload(BaseFileUpload, ProjectScopedMixin):
    """Presigned upload request for a project zip file."""

    type: Literal[FileTypeEnum.ZIP.value] = Field(  # type: ignore
        ..., description="Must be 'zip'"
    )


class EwmsZipUpload(BaseFileUpload, ProjectScopedMixin):
    """Presigned upload request for an EWMS zip file."""

    type: Literal[FileTypeEnum.EWMS_ZIP.value] = Field(  # type: ignore
        ..., description="Must be 'ewms_zip'"
    )


class EwmsDocumentUpload(BaseFileUpload, ProjectScopedMixin):
    """Internal upload model for a document extracted from an EWMS ZIP."""

    type: Literal[FileTypeEnum.EWMS_DOCUMENT.value] = Field(  # type: ignore
        ..., description="Internal EWMS document extracted from ZIP"
    )


class ErwiderungsImportUpload(BaseFileUpload, ProjectScopedMixin):
    """Presigned upload request for an Erwiderungs CSV import."""

    type: Literal[FileTypeEnum.ERWIDERUNGS_IMPORT.value] = Field(  # type: ignore
        ..., description="Must be 'erwiderungs_import'"
    )


class ErwiderungsExportUpload(BaseFileUpload, ProjectScopedMixin):
    """Internal upload model for a generated Erwiderungs CSV export."""

    type: Literal[FileTypeEnum.ERWIDERUNGS_EXPORT.value] = Field(  # type: ignore
        ..., description="Must be 'erwiderungs_export'"
    )


class ContentExtractionUpload(BaseFileUpload, ProjectScopedMixin):
    """Internal upload of extracted content for a project document."""

    type: Literal[FileTypeEnum.CONTENT_EXTRACTION.value] = Field(  # type: ignore
        ..., description="Internal content extraction result"
    )


class TemplateUpload(BaseFileUpload, OptionalProjectScopedMixin):
    """Presigned upload request for a global template."""

    type: Literal[FileTypeEnum.TEMPLATE.value] = Field(  # type: ignore
        ..., description="Must be 'template'"
    )


class LawDataUpload(BaseFileUpload, OptionalProjectScopedMixin):
    """Direct upload of global law/reference data files."""

    type: Literal[FileTypeEnum.LAW_DATA.value] = Field(  # type: ignore
        ..., description="Global law data file"
    )


class RedactedDocumentUpload(BaseFileUpload, ProjectScopedMixin):
    """Internal upload model for redacted/anonymized document outputs."""

    type: Literal[FileTypeEnum.REDACTED_DOCUMENT.value] = Field(  # type: ignore
        ..., description="Internal redacted/anonymized document output"
    )


class TemporalCheckpointUpload(BaseFileUpload, TemporalScopedMixin, OptionalProjectScopedMixin):
    """Internal checkpoint file for Temporal workflow execution."""

    type: Literal[FileTypeEnum.TEMPORAL_CHECKPOINT.value] = Field(  # type: ignore
        ..., description="Temporal workflow checkpoint"
    )


# Discriminated union — public (API-facing) excludes internal-only types
PublicUploadRequest = Annotated[
    ProjectDocumentUpload | ProjectZipUpload | TemplateUpload | EwmsZipUpload | ErwiderungsImportUpload,
    Field(discriminator="type"),
]

# Full union including internal types (used by internal endpoints / FileService)
UploadRequest = Annotated[
    ProjectDocumentUpload
    | ProjectZipUpload
    | EwmsZipUpload
    | EwmsDocumentUpload
    | ErwiderungsImportUpload
    | ErwiderungsExportUpload
    | ContentExtractionUpload
    | RedactedDocumentUpload
    | LawDataUpload
    | TemporalCheckpointUpload
    | TemplateUpload,
    Field(discriminator="type"),
]


# Response models
class FileDownloadResponse(BaseModel, CamelConfig):
    """Presigned URL for downloading a file."""

    download_url: str = Field(..., description="Presigned download URL (expires in 4 h)")


class FileUploadUrlResponse(BaseModel, CamelConfig):
    """Presigned URL and expected MIME type for upload."""

    upload_url: str = Field(..., description="Presigned PUT URL")
    mime_type: str = Field(..., description="Expected MIME type (e.g. application/pdf)")


class FileUpdateRequest(BaseModel, CamelConfig):
    """Request to update mutable file properties (admin/internal only)."""

    mime_type: str | None = Field(None, description="Override detected MIME type")
    vector_searchable: bool | None = Field(None, description="If file is vectorized")
    filename: str | None = Field(None, description="File name")
    topics: list[UUID] | None = Field(None, description="List of topics")


class StartFileProcessingRequest(BaseModel):
    """Request to validate and process an uploaded ZIP via Temporal."""

    model_config = ConfigDict(
        **CamelConfig.model_config,
        extra="forbid",
    )

    file_id: UUID = Field(..., description="Uploaded file ID")
    project_id: UUID = Field(..., description="Project ID")


class StartFileProcessingResponse(BaseModel, CamelConfig):
    """Response with Temporal workflow identifiers for polling."""

    workflow_id: str = Field(..., description="Temporal workflow ID")
    run_id: str = Field(..., description="Temporal run ID")
    workflow_status: WorkflowStatusEnum = Field(..., description="Current processing status for this ZIP upload")


class ZipFileResponse(BaseModel, CamelConfig):
    """Complete zip file metadata returned to clients."""

    id: UUID = Field(..., description="Zip file UUID")
    filename: str = Field(..., description="Original filename")
    type: FileTypeEnum = Field(..., description="File type")
    bucket_path: PurePosixPath = Field(..., description="Full path in bucket")
    project_id: UUID = Field(..., description="Project ID")
    workflow_status: WorkflowStatusEnum = Field(..., description="Processing workflow status for this ZIP upload")
    approval_status: ZipApprovalStatus | None = Field(None, description="Business approval state for this ZIP upload")
    approval_error: str | None = Field(None, description="Last approval/version creation error")
    source_project_version: int | None = Field(None, description="Project version used to compute the ZIP diff")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class FileResponse(BaseModel, CamelConfig):
    """Complete file metadata returned to clients."""

    id: UUID = Field(..., description="File UUID")
    type: FileTypeEnum = Field(..., description="File type")
    filename: str = Field(..., description="Original filename")
    mime_type: str = Field(..., description="MIME type")
    bucket_path: PurePosixPath = Field(..., description="Full path in bucket")
    version: int = Field(..., description="File version")
    project_version: int = Field(..., description="Project version")
    added_in_version: int | None = Field(None, description="Project version where this file was introduced")
    is_deleted: bool = Field(..., description="If file is marked as deleted")

    project_id: UUID | None = Field(None, description="Project scope")
    workflow_id: str | None = Field(None, description="Temporal workflow id")
    run_id: str | None = Field(None, description="Temporal run id")
    vector_searchable: bool | None = Field(None, description="If file is vectorized")
    topics: list[UUID] = Field(default_factory=[], description="List of topic IDs")

    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    @field_validator("topics", mode="before")
    @classmethod
    def normalize_topics(cls, v: Any) -> list[UUID]:
        """
        Runs BEFORE validation — converts ORM objects to UUIDs
        """
        if not v:
            return []

        # Handle list[FileTopic]
        if hasattr(v[0], "topic_id"):
            return [ft.topic_id for ft in v if ft.topic_id is not None]

        return [UUID(str(x)) for x in v]
