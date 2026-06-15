"""Type definitions for the file processing workflow.

This module contains all Pydantic models used as inputs and outputs
for the file processing workflow.
"""

from typing import Literal

from pydantic import BaseModel


class FileProcessingSuccess(BaseModel):
    """Represents a successfully processed file.

    Attributes:
        file_id: Unique identifier for the processed file.
        filename: Name of the file that was processed.
        action: The action that was performed on the file.
    """

    file_id: str | None
    filename: str
    action: str


class FileProcessingFailure(BaseModel):
    """Represents a file that failed to process.

    Attributes:
        filename: Name of the file that failed to process.
        action: The action that was attempted on the file.
        error_code: Optional error code indicating the type of failure.
        error_message: Optional detailed error message describing the failure.
    """

    filename: str
    action: str
    error_code: str | None
    error_message: str | None


class FileProcessingSummary(BaseModel):
    """Summary statistics for a file processing operation.

    Attributes:
        total: Total number of files processed.
        succeeded: Number of files that were successfully processed.
        failed: Number of files that failed to process.
    """

    total: int
    succeeded: int
    failed: int


class FileProcessingParams(BaseModel):
    """Input parameters for the file processing workflow.

    Attributes:
        file_id: Unique identifier for the file to be processed.
        filename: Name of the file to be processed.
        project_id: ID of the project the file belongs to.
        file_type: Type of file being processed (default: "zip").
        zip_path: Path to the ZIP file if applicable (default: "").
        entry_file_type: Type of entry file within the archive (default: "document").
    """

    file_id: str
    filename: str
    project_id: str
    file_type: Literal["zip"] = "zip"
    zip_path: str = ""
    entry_file_type: str = "document"


class FileprocessingOutput(BaseModel):
    """The standardized output object returned by the file processing workflow.

    Attributes:
        successful: List of files that were successfully processed.
        failed: List of files that failed to process.
        summary: Summary statistics for the processing operation.
        status: Overall status of the workflow execution.
    """

    successful: list[FileProcessingSuccess]
    failed: list[FileProcessingFailure]
    summary: FileProcessingSummary
    status: str
