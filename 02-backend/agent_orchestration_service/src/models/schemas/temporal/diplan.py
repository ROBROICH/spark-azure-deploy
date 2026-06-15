from uuid import UUID

from pydantic import BaseModel


class DiPlanFile(BaseModel):
    url: str
    request_id: str
    file_name: str
    file_id: UUID
    folder_name: str


class FolderChildren(BaseModel):
    name: str
    id: str
    required: bool
    contentRequirements: str


class DiPlanFolderInformation(BaseModel):
    name: str
    children: list[FolderChildren]


class DiPlanWorkflowRequest(BaseModel):
    request_id: str
    files: list[DiPlanFile]
    folder_information: list[DiPlanFolderInformation]


class DiPlanWorkflowArgs(BaseModel):
    project_id: str
    folder_information: list[DiPlanFolderInformation]
    files: list[DiPlanFile]


class DiPlanDownloadWorkflowArgs(BaseModel):
    project_id: str
    files: list[DiPlanFile]


class UploadFileToDMSActivityArgs(BaseModel):
    project_id: str
    url: str
    file_name: str
    folder_name: str
    file_id: UUID


class SendFVPResultsActivityArgs(BaseModel):
    project_id: str
    file_id: str


class SendPlausibilityResultsActivityArgs(BaseModel):
    project_id: str
    file_id: str
