from uuid import UUID

from pydantic import AliasChoices, BaseModel, Field

# ---------------------------------------------------------------------------
# NormData — typed representation of the norm JSON payload.
# Only fields actually accessed by modul-suche-und-zuordnung are included.
# ---------------------------------------------------------------------------


class DefinitionSource(BaseModel):
    jurabk: str
    paragraph_nr: str


class Definition(BaseModel):
    # Upstream JSON often omits these keys; treat as absent → None.
    uuid: str | None = None
    definition: str
    source: DefinitionSource | None = None


class BestimmterRechtsbegriff(BaseModel):
    begriff: str
    selected_definition: str | None = None
    definitions: list[Definition]


class Auslegungsvorschlag(BaseModel):
    auslegungvorschlag: str


class UnbestimmterRechtsbegriff(BaseModel):
    begriff: str
    # Source data uses the umlaut variant (auslegungsvorschläge) or the
    # ASCII fallback — accept both via validation alias.
    auslegungsvorschlaege: list[Auslegungsvorschlag] = Field(
        validation_alias=AliasChoices("auslegungsvorschlaege", "auslegungsvorschläge"),
    )


class Rechtsbegriffe(BaseModel):
    bestimmte_rechtsbegriffe: list[BestimmterRechtsbegriff]
    unbestimmte_rechtsbegriffe: list[UnbestimmterRechtsbegriff]


class AtomaresTBM(BaseModel):
    id: UUID | None = None
    prueffrage: str | None
    rechtsbegriffe: Rechtsbegriffe | None


class Satz(BaseModel):
    id: str | None = None
    satz_nr: str | int
    position: int | None = None
    satz_text: str
    norm_typ_lvl_1: str | None = None
    norm_typ_lvl_2: str | None = None
    # Upstream payloads may omit these on Sätze without TBMs (e.g. Rechtsfolgen-only).
    tatbestandsmerkmale: list[str] = Field(default_factory=list)
    atomare_tatbestandsmerkmale: list[AtomaresTBM] = Field(default_factory=list)


class Absatz(BaseModel):
    absatz_nr: str | int
    absatz_text: str
    saetze: list[Satz]


class NormData(BaseModel):
    gesetz: str
    jurabk: str
    # Some callers only send paragraph_nr / absaetze; key may be omitted.
    paragraph: str | None = None
    paragraph_nr: str
    paragraph_titel: str
    absaetze: list[Absatz]


# ---------------------------------------------------------------------------
# Document structure for pageindex SVM pipeline.
#
# The agent orchestrator must build this data from DMS _processed.json files:
#   1. For each document in the project, download the _processed.json via DMS API
#   2. Group chunks by page_index_node.node_id (chunks without page_index_node
#      are continuation chunks — attach to the previous node)
#   3. Per node: concatenate sub-chunk page_content into text, collect all
#      chunk_ids (parent + sub-chunks), take header as title, summary from
#      page_index_node.summary
#   4. dms_file_id is the DMS file listing ID (file_obj["id"]), NOT
#      metadata.document_id — this is what Qdrant stores as document_id
#
# Reference implementation: 05-modulcluster/modul-suche-und-zuordnung/evals/prepare_pageindex_input.py
# ---------------------------------------------------------------------------


class DocumentNode(BaseModel):
    node_id: str
    title: str
    text: str
    summary: str
    chunk_ids: list[str]
    page_numbers: list[int] = []


class Document(BaseModel):
    file_id: str
    document_name: str
    nodes: list[DocumentNode]


# ---------------------------------------------------------------------------
# Workflow I/O types
# ---------------------------------------------------------------------------


class MatchedDocument(BaseModel):
    """A document matched to a TBM, identified by its ID and display title."""

    document_id: str | None = None
    title: str | None = None
    tbm_id: UUID | None = None
    score: float = 0.0


class PageIndexSVMEntry(BaseModel):
    node_id: str
    document_id: str
    title: str | None
    text: str
    chunk_ids: list[str] = []
    page_numbers: list[int] = []


class PageIndexSVMResult(BaseModel):
    originaltexte: list[PageIndexSVMEntry]


class PageIndexSVMWorkflowOutput(BaseModel):
    result: PageIndexSVMResult | None


class MatchedDocumentResult(BaseModel):
    document_id: str | None
    title: str | None



class SatzOrchestratorWorkflowInput(BaseModel):
    """Input for the SatzOrchestrator workflow identifying the Satz and its norm context."""

    norm: str
    tbm: str
    satz_id: str
    gesetz_id: str
    norm_id: str

    data: NormData
    project_id: str
    normdetail_id: str
    max_concurrent_pageindex_svm: int | None = None
    document_nodes: list[Document]


class SatzOrchestratorWorkflowOutput(BaseModel):
    """Output of the SatzOrchestrator containing a flat list of relevant text sections."""

    satz_id: str
    gesetz_id: str
    norm_id: str
    originaltexte: list[PageIndexSVMEntry]
