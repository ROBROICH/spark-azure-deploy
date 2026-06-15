from pydantic import BaseModel, Field


class UpdateRechtsprechungInput(BaseModel):
    """Input for the ``UpdateRechtsprechungWorkflow``."""

    overwrite: bool = Field(
        default=False,
        description="If true, replace existing rows in the documents table.",
    )
    offset: int | None = Field(
        default=None,
        description="If set, skip the first `offset` TOC entries. Used for pagination.",
    )
    max_documents: int | None = Field(
        default=None,
        description="If set, limit the number of TOC entries processed.",
    )


class UpdateRechtsprechungOutput(BaseModel):
    """Summary of the ``UpdateRechtsprechungWorkflow`` run."""

    written: int
    skipped: int
    duplicate: int
    failed: int
