from uuid import UUID

from pydantic import BaseModel


class FPPFile(BaseModel):
    """FPP file information for download."""

    url: str
    file_name: str
    file_id: UUID
    file_type: str


class FPPDownloadWorkflowArgs(BaseModel):
    """Arguments for FPP download workflow."""

    project_id: str
    file: FPPFile


class UploadFPPFileToDMSActivityArgs(BaseModel):
    """Arguments for uploading FPP file to DMS."""

    project_id: str
    url: str
    file_name: str
    file_id: UUID
    file_type: str
