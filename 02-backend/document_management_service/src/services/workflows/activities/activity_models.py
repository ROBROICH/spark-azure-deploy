from dataclasses import dataclass, field


@dataclass
class SingleFileResult:
    success: bool
    filename: str
    action: str
    file_id: str | None = None
    bucket_path: str | None = None
    error_code: str | None = None
    error_message: str | None = None


# Validate ZIP
@dataclass
class ValidateZipInput:
    zip_path: str
    filename: str


@dataclass
class ValidateZipOutput:
    entry_count: int
    total_uncompressed_size: int


# ZIP Status
@dataclass
class UpdateFileStatusInput:
    zip_file_id: str
    status: str


@dataclass
class UpdateZipApprovalStatusInput:
    zip_file_id: str
    status: str | None
    error: str | None = None


@dataclass
class PersistZipDiffInput:
    zip_file_id: str
    source_project_version: int
    diff: "FileDiffResult"


# Extract ZIP
@dataclass
class ExtractZipInput:
    zip_file_id: str
    filename: str
    project_id: str
    zip_path: str
    file_type: str = "zip"


@dataclass
class ComputeDiffInput:
    project_id: str
    zip_file_id: str
    files: list[SingleFileResult]
    project_version: int = 1
    entry_file_type: str = "document"
    rename_similarity_threshold: float = 0.65
    rename_same_dir_only: bool = True


@dataclass
class NewFile:
    filename: str
    bucket_path: str
    sha: str | None = None


@dataclass
class FileChange:
    file_id: str
    bucket_path: str
    filename: str
    source_sha: str
    target_sha: str


@dataclass
class RenameChange:
    file_id: str
    old_name: str
    new_name: str
    sha: str
    bucket_path: str | None = None


@dataclass
class DeleteChange:
    file_id: str
    filename: str
    sha: str


@dataclass
class Unchanged:
    file_id: str
    filename: str
    sha: str


@dataclass
class DuplicateFile:
    """Represents a file that has a duplicate filename in the target."""

    filename: str
    bucket_path: str
    existing_file_id: str


@dataclass
class FileDiffResult:
    new: list[NewFile] = field(default_factory=list)
    deleted: list[DeleteChange] = field(default_factory=list)
    changed: list[FileChange] = field(default_factory=list)
    renamed: list[RenameChange] = field(default_factory=list)
    unchanged: list[Unchanged] = field(default_factory=list)
    duplicate: list[DuplicateFile] = field(default_factory=list)


@dataclass
class IngestFileInput:
    zip_file_id: str
    project_id: str
    project_version: int
    filename: str
    bucket_path: str
    entry_file_type: str = "document"
    file_id: str | None = None


@dataclass
class RenameFileInput:
    project_id: str
    project_version: int
    file_id: str
    old_name: str
    new_name: str
