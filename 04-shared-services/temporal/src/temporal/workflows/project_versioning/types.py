from uuid import UUID

from pydantic import BaseModel, Field


class FileDiffEntry(BaseModel):
    file_id: str
    filename: str | None = None
    old_name: str | None = None
    new_name: str | None = None

    @property
    def target_filename(self) -> str | None:
        return self.new_name or self.filename


class FileDiffSummary(BaseModel):
    deleted: list[FileDiffEntry] = Field(default_factory=list)
    changed: list[FileDiffEntry] = Field(default_factory=list)
    renamed: list[FileDiffEntry] = Field(default_factory=list)


class CreateProjectVersionInput(BaseModel):
    project_id: UUID
    zip_file_id: UUID | None = None
    file_diff: FileDiffSummary = Field(default_factory=FileDiffSummary)


class ProjectVersioningServiceEndpoint(BaseModel):
    service: str
    base_url: str


class CreateProjectVersionOutput(BaseModel):
    status: str
    new_version: int | None = None
    id_mappings: dict[str, dict[str, str]] | None = None
    message: str | None = None
