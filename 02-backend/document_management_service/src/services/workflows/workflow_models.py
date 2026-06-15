from dataclasses import dataclass
from typing import Literal

from audit_client.workflow import WorkflowActorContext


# FileProcessing
@dataclass
class FileProcessingInput:
    file_id: str
    filename: str
    project_id: str
    file_type: Literal["zip", "ewms_zip"] = "zip"
    zip_path: str = ""
    entry_file_type: str = "document"
    source_project_version: int = 1
    workflow_actor: WorkflowActorContext | None = None


@dataclass
class FileProcessingSuccess:
    file_id: str | None
    filename: str
    action: str


@dataclass
class FileProcessingFailure:
    filename: str
    action: str
    error_code: str | None
    error_message: str | None


@dataclass
class FileProcessingSummary:
    total: int
    succeeded: int
    failed: int


@dataclass
class FileProcessingOutput:
    successful: list[FileProcessingSuccess]
    failed: list[FileProcessingFailure]
    summary: FileProcessingSummary
    status: str


# SingleFileProcessing
@dataclass
class SingleFileProcessingInput:
    file_id: str
    bucket_path: str
    filename: str
    file_type: str = "document"
    project_id: str | None = None
    workflow_actor: WorkflowActorContext | None = None
