"""Internal pydantic types for the update_rechtsprechung workflow's activities."""

from typing import Literal

from pydantic import BaseModel, Field


class RechtsprechungSpec(BaseModel):
    """A single TOC entry to download + parse + persist."""

    doc_id: str


class ProcessRechtsprechungInput(BaseModel):
    """Input for the per-document process activity.

    ``existing_doc_ids`` is the snapshot returned by ``_query_existing_doc_ids``;
    the activity uses it to decide whether to write or skip without downloading.
    """

    spec: RechtsprechungSpec
    overwrite: bool = False
    existing_doc_ids: list[str] = Field(default_factory=list)


class ProcessRechtsprechungResult(BaseModel):
    doc_id: str
    status: Literal["written", "skipped", "duplicate", "failed"]
    error: str | None = None
