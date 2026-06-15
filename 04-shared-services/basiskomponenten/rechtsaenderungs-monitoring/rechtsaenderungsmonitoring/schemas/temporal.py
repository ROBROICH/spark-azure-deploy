"""Internal pydantic types for the monitor_rechtsaenderungen workflow's activities."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field
from temporal.workflows.rechtsaenderungs_monitoring.types import Bundesland, FeedEntry, Source

from rechtsaenderungsmonitoring.schemas.db import BaseNorm, DocType


class ParseEntryInput(BaseModel):
    """Input for the extract activity.

    ``existing_doc_ids`` is the snapshot returned by ``query_existing_doc_ids``;
    the activity uses it to decide whether to extract or skip an entry.
    """

    source: Source
    location: Bundesland | None = None
    entry: FeedEntry
    overwrite: bool = False
    existing_doc_ids: list[str] = Field(default_factory=list)


class ParseEntryResult(BaseModel):
    """individual result for each feed entry"""

    title_hash: str
    doc_id: str | None = None
    status: Literal["written", "skipped", "failed"]
    error: str | None = None


class BaseAffectedNorm(BaseModel):
    """A single affected norm as produced by the summarisation LLM call."""

    name: str = Field(description="Name des betroffenen Rechtsdokuments")
    valid_from: date | None = Field(default=None, description="Datum, an dem die Änderungen in Kraft treten")


class NormResult(BaseAffectedNorm):
    """Output of the summarisation LLM call for one affected norm."""

    paragraph_nr: str = Field(
        description="Paragraphennummer als Text, da sie Buchstaben enthalten kann, z.B. `45a`, aber niemals das Präfix `§`/`Art.`/`Artikel` enthält."
    )
    source_text: str = Field(description="der Änderungstext, wie er aus dem PDF extrahiert wurde")


class NormFull(BaseAffectedNorm, BaseNorm):
    """Full norm, extended with information from gesetze-normen-db and an additional llm call."""

    jurabk: str
    change_text: str = Field(description="Änderungstext (beschreibt die Änderung)")
    current_text: str = Field(description="aktueller Gesetzestext (aus gesetze-normen-db)")
    new_text: str = Field(description="Gesetzestext nach der Änderung")
    transitional_note: str = Field("", description="ggf. Übergangsregelungen")


class PageText(BaseModel):
    """One extracted PDF page, fed to the summarisation LLM call."""

    page_nr: int
    text: str


class ExtractEntryResult(BaseModel):
    """Output of the ``extract_entry`` activity.

    ``skipped`` means the document was already ingested; ``pages``/``title``/
    ``description`` are then empty.
    """

    title_hash: str
    title: str = ""
    description: str = ""
    pages: list[PageText] = Field(default_factory=list)
    status: Literal["extracted", "skipped"]


class PersistDocumentInput(BaseModel):
    """Input for the ``persist_document`` activity.

    ``affected_norms`` and ``doc_type`` are produced by the workflow-level LLM
    calls; the activity resolves jurabks and writes the document to the DB.
    """

    title_hash: str
    title: str
    doc_type: DocType
    affected_norms: list[NormFull] = Field(default_factory=list)
    valid_from: date
    overwrite: bool = False
