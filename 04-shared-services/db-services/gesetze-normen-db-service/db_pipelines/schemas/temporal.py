"""Internal pydantic types for the update_rechtsgrundlage workflow's activities."""

from typing import Literal, Any

from pydantic import BaseModel, Field, HttpUrl

from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.schemas.db import DocType
from db_pipelines.parsers.base_processor import BaseProcessor


class NormSpec(BaseModel):
    """Single norm to fetch + parse, used as input to download/parse activities."""

    source: Hierarchy
    parser: str = Field(..., description="Name of the parser class")
    extra: dict[str, Any] = Field(default_factory=dict, description="Additional keyword arguments for the parser")
    base_url: HttpUrl

    slug: str
    doctype: DocType
    bundesland: Bundesland | None = None


class DocSpec(NormSpec):
    """Extends NormSpec with the dowload_hash, used as input to the write activity."""

    dowload_hash: str


class ParseNormInput(BaseModel):
    """Input for the parse activity."""

    spec: NormSpec
    overwrite: bool = False


class ParseNormResult(BaseModel):
    slug: str
    jurabk: str | None = None
    status: Literal["written", "skipped"]
    error: str | None = None
