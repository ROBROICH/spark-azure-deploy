from dataclasses import dataclass, field


@dataclass
class UnarchivedRow:
    workflow_id: str
    run_id: str
    workflow_type: str
    project_id: str | None
    project_version: str | None
    status: str


@dataclass
class ListUnarchivedBatchInput:
    batch_size: int
    excluded_keys: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class ArchiveOneInput:
    row: UnarchivedRow


@dataclass
class MarkArchivedInput:
    workflow_id: str
    run_id: str
    s3_key: str
