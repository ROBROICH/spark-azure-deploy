import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LegalBasisStandangabeResponse(BaseModel):
    standtyp: str | None = None
    standkommentar: str | None = None


class LegalBasisLawResponse(BaseModel):
    node_type: Literal["gesetz"] = "gesetz"
    id: str
    name: str
    jurabk: str
    titel: str | None = None
    kurztitel: str | None = None
    doknr: str | None = None
    bundesland: str | None = None
    dokument_typ: str | None = None
    fundstelle: str | None = None
    standangaben: list[LegalBasisStandangabeResponse] = Field(default_factory=list)


class LegalBasisNormInfoResponse(BaseModel):
    node_type: Literal["norm"] = "norm"
    id: str
    gesetz_id: str
    paragraph_nr: str
    paragraph_titel: str | None = None
    text: str | None = None
    regelungsgegenstand: str | None = None
    doknr: str | None = None
    prev: str | None = None
    next: str | None = None
    frontend_parent_ids: list[str] = Field(default_factory=list)
    is_outdated: bool = False


class LegalBasisNormResponse(BaseModel):
    jurabk: str
    paragraph_nr: str
    paragraph_titel: str | None = None
    gesetz_titel: str | None = None
    gesetz_kurztitel: str | None = None
    doknr: str | None = None
    bundesland: str | None = None
    dokument_typ: str | None = None
    gesetz: LegalBasisLawResponse
    norm: LegalBasisNormInfoResponse
    is_deconstructed: bool
    deconstruction_id: uuid.UUID | None = None
    deconstruction_created_at: datetime | None = None


class LegalBasisNormSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jurabk: str
    paragraph_nr: str


class LegalBasisAddNormRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_id: uuid.UUID
    norms: list[LegalBasisNormSelection]
    type: Literal["pruefung", "verfahren"] = "pruefung"


class ProjectLegalBasisLawResponse(BaseModel):
    node_type: Literal["gesetz"] = "gesetz"
    id: uuid.UUID
    project_id: uuid.UUID
    project_version: int
    name: str
    jurabk: str
    frontend_parent_ids: list[str] = Field(default_factory=list)
    is_deleted: bool = False
    is_outdated: bool = False
    update_type: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectLegalBasisNormResponse(BaseModel):
    node_type: Literal["norm"] = "norm"
    id: uuid.UUID
    project_id: uuid.UUID
    project_version: int
    gesetz_id: uuid.UUID
    paragraph_nr: str
    paragraph_titel: str | None = None
    text: str
    regelungsgegenstand: str | None = None
    frontend_parent_ids: list[str] = Field(default_factory=list)
    is_deleted: bool = False
    is_outdated: bool = False
    update_type: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectLegalBasisTopicNormResponse(BaseModel):
    node_type: Literal["topic_norm"] = "topic_norm"
    id: uuid.UUID
    topic_id: uuid.UUID
    project_id: uuid.UUID
    project_version: int
    jurabk: str
    paragraph_nr: str | None = None
    type: Literal["pruefung", "verfahren"]
    absatz: str | None = None
    satz: str | None = None
    nummer: str | None = None
    mvp_status: str
    satz_statuses: dict[str, str] = Field(default_factory=dict)
    frontend_parent_ids: list[str] = Field(default_factory=list)
    is_deleted: bool = False
    is_outdated: bool = False
    update_type: str | None = None
    created_at: datetime
    updated_at: datetime


class LegalBasisAddNormItemResponse(BaseModel):
    gesetz: ProjectLegalBasisLawResponse
    norm: ProjectLegalBasisNormResponse
    topic_norm: ProjectLegalBasisTopicNormResponse
    created_gesetz: bool
    created_norm: bool
    created_topic_norm: bool
    is_deconstructed: bool
    deconstruction_id: uuid.UUID | None = None
    deconstruction_created_at: datetime | None = None


class LegalBasisAddNormResponse(BaseModel):
    items: list[LegalBasisAddNormItemResponse]
