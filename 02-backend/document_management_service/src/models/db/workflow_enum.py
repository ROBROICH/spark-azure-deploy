from enum import StrEnum


class WorkflowStatusEnum(StrEnum):
    """Temporal workflow lifecycle states."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    TERMINATED = "TERMINATED"
    CONTINUED_AS_NEW = "CONTINUED_AS_NEW"
    TIMED_OUT = "TIMED_OUT"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"


class ZipFileTypeEnum(StrEnum):
    """ZIP-File types"""

    ZIP = "zip"
    EWMS_ZIP = "ewms_zip"


class ErrorCode(StrEnum):
    """Error codes returned by workflow activities."""

    VALIDATION_FAILED = "VALIDATION_FAILED"
    ZIP_INVALID = "ZIP_INVALID"
    ZIP_NOT_FOUND = "ZIP_NOT_FOUND"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    UPLOAD_FAILED = "UPLOAD_FAILED"
    RENAME_FAILED = "RENAME_FAILED"
    VIRUS_DETECTED = "VIRUS_DETECTED"
    INVALID_FILENAME = "INVALID_FILENAME"
    DUPLICATE_FILE = "DUPLICATE_FILE"
    UNSUPPORTED_FILETYPE = "UNSUPPORTED_FILETYPE"


class ActionEnum(StrEnum):
    """Actions a workflow can apply to a file."""

    INGEST = "INGEST"
    RENAME = "RENAME"
    UNZIP = "UNZIP"
    UPLOAD = "UPLOAD"


class ApprovalStatus(StrEnum):
    """Approval state for file actions that require confirmation."""

    APPROVED = "APPROVED"
    PENDING = "PENDING"
    REJECTED = "REJECTED"


class ZipApprovalStatus(StrEnum):
    """Business approval state for ZIP uploads that create a document basis."""

    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"
    APPROVING = "APPROVING"
    APPROVED = "APPROVED"
    FAILED_APPROVE = "FAILED_APPROVE"
    REJECTED = "REJECTED"


class ZipDiffKind(StrEnum):
    """Computed diff bucket for a ZIP entry."""

    NEW = "new"
    DELETED = "deleted"
    CHANGED = "changed"
    RENAMED = "renamed"
    UNCHANGED = "unchanged"
