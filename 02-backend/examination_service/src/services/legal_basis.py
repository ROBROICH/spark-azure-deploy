import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status
from node_crud import UpdateType
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import bindparam, select, text
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.models.db.prufung_models import Gesetz, Norm
from src.models.schemas.legal_basis import (
    LegalBasisAddNormItemResponse,
    LegalBasisAddNormRequest,
    LegalBasisAddNormResponse,
    LegalBasisLawResponse,
    LegalBasisNormInfoResponse,
    LegalBasisNormResponse,
    LegalBasisNormSelection,
    LegalBasisStandangabeResponse,
    ProjectLegalBasisLawResponse,
    ProjectLegalBasisNormResponse,
    ProjectLegalBasisTopicNormResponse,
)

LAW_DB_TIMEOUT_SECONDS = 30.0
PROJECT_LOGIC_TIMEOUT_SECONDS = 30.0
logger = logging.getLogger(__name__)

_DECONSTRUCTION_CACHE_QUERY = text(
    """
    SELECT nd.id, nd.jurabk, nd.paragraph, nd.created_at
    FROM norm_deconstruction AS nd
    JOIN unnest(
        CAST(:jurabks AS TEXT[]),
        CAST(:paragraphs AS TEXT[])
    ) AS keys(jurabk, paragraph)
      ON nd.jurabk = keys.jurabk
     AND nd.paragraph = keys.paragraph
    """
).bindparams(
    bindparam("jurabks", type_=ARRAY(TEXT())),
    bindparam("paragraphs", type_=ARRAY(TEXT())),
)


class LawDbStandangabePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    standtyp: str | None = None
    standkommentar: str | None = None


class LawDbDocumentPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    doknr: str | None = None
    jurabk: str | None = None
    langue: str | None = None
    titel: str | None = None
    kurzue: str | None = None
    kurztitel: str | None = None
    bundesland: str | None = None
    doktyp: str | None = None
    fundstelle: str | None = None
    standangaben: list[LawDbStandangabePayload] = Field(default_factory=list)


class LawDbNormPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    jurabk: str
    paragraph_nr: str
    titel: str | None = None
    paragraph_text: str | None = None
    doknr: str | None = None
    bundesland: str | None = None
    dokument_typ: str | None = None
    prev: str | None = None
    next: str | None = None


class LawDbTocPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, validation_alias="Title")
    ident: str | None = Field(default=None, validation_alias="Ident")
    paragraph_nr: str | None = None
    paragraph_typ: str | None = None
    text: str | None = None
    jurabk: str
    doknr: str | None = None


@dataclass(frozen=True)
class CachedNormDeconstruction:
    id: uuid.UUID
    jurabk: str
    paragraph: str
    created_at: datetime


@dataclass(frozen=True)
class LawDbNormPayloadPage:
    items: list[LawDbNormPayload]
    total: int


@dataclass(frozen=True)
class LegalBasisNormPage:
    items: list[LegalBasisNormResponse]
    total: int
    offset: int
    limit: int | None
    next_offset: int | None


def _law_db_base_url() -> str:
    return settings.LAW_DATABASE_BASE_URL.rstrip("/")


def _project_logic_base_url() -> str:
    return settings.PROJECT_LOGIC_SERVICE_URL.rstrip("/")


def _http_error(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _response_error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text
    detail = body.get("detail") if isinstance(body, dict) else None
    return str(detail or response.text)


async def _get_json(path: str, params: dict[str, Any] | None = None) -> object:
    url = f"{_law_db_base_url()}{path}"
    try:
        async with httpx.AsyncClient(timeout=LAW_DB_TIMEOUT_SECONDS) as client:
            response = await client.get(url, params=params)
    except httpx.RequestError as exc:
        logger.warning("Law database request failed for %s: %s", path, exc)
        raise _http_error(
            status.HTTP_502_BAD_GATEWAY,
            "Law database request failed.",
        ) from exc

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning("Law database returned status %s for %s", response.status_code, path)
        raise _http_error(
            status.HTTP_502_BAD_GATEWAY,
            f"Law database returned status {response.status_code}.",
        ) from exc

    try:
        return response.json()
    except ValueError as exc:
        logger.warning("Law database returned invalid JSON for %s", path)
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Law database returned invalid JSON.") from exc


async def _project_logic_json(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> object:
    url = f"{_project_logic_base_url()}{path}"
    try:
        async with httpx.AsyncClient(timeout=PROJECT_LOGIC_TIMEOUT_SECONDS) as client:
            response = await client.request(method, url, params=params, json=json_body)
    except httpx.RequestError as exc:
        logger.warning("Project Logic request failed for %s %s: %s", method, path, exc)
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic request failed.") from exc

    if response.status_code == status.HTTP_404_NOT_FOUND:
        raise _http_error(status.HTTP_404_NOT_FOUND, "Project Logic resource not found.")
    if response.status_code == status.HTTP_409_CONFLICT:
        raise _http_error(status.HTTP_409_CONFLICT, _response_error_detail(response))
    if response.is_error:
        logger.warning(
            "Project Logic returned status %s for %s %s: %s", response.status_code, method, path, response.text
        )
        raise _http_error(
            status.HTTP_502_BAD_GATEWAY,
            f"Project Logic returned status {response.status_code}.",
        )

    try:
        return response.json()
    except ValueError as exc:
        logger.warning("Project Logic returned invalid JSON for %s %s", method, path)
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned invalid JSON.") from exc


async def _get_document_metadata(
    jurabk: str,
    bundesland: str | None,
) -> LawDbDocumentPayload:
    params = {"bundesland": bundesland} if bundesland else None
    raw_document = await _get_json(f"/documents/{quote(jurabk, safe='')}", params=params)
    try:
        return LawDbDocumentPayload.model_validate(raw_document)
    except ValidationError as exc:
        logger.warning("Law database returned invalid document payload for %s: %s", jurabk, exc)
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Law database returned an invalid document payload.") from exc


async def _get_documents_metadata(
    bundesland: str | None,
) -> list[LawDbDocumentPayload]:
    params = {"bundesland": bundesland} if bundesland else None
    raw_documents = await _get_json("/documents/", params=params)
    if not isinstance(raw_documents, list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Law database returned an invalid documents payload.")

    documents: list[LawDbDocumentPayload] = []
    for index, document in enumerate(raw_documents):
        try:
            documents.append(LawDbDocumentPayload.model_validate(document))
        except ValidationError as exc:
            logger.warning("Law database returned invalid document payload at index %s: %s", index, exc)
            raise _http_error(
                status.HTTP_502_BAD_GATEWAY,
                f"Law database returned an invalid document payload at index {index}.",
            ) from exc
    return documents


def _normalize_paragraph_nr(paragraph_nr: str | None) -> str | None:
    if paragraph_nr is None:
        return None
    normalized = paragraph_nr.strip().removeprefix("§").strip()
    return normalized or None


def _deconstruction_cache_paragraph_key(paragraph_nr: str | None) -> str | None:
    normalized = _normalize_paragraph_nr(paragraph_nr)
    if normalized is None:
        return None
    compact = re.sub(r"[\s\u00a0]+", "", normalized)
    return compact or None


def _paragraph_cache_variants(paragraph_nr: str) -> set[str]:
    normalized = _normalize_paragraph_nr(paragraph_nr)
    if normalized is None:
        return {paragraph_nr}
    variants = {paragraph_nr, normalized, f"§ {normalized}", f"§{normalized}"}
    compact = _deconstruction_cache_paragraph_key(paragraph_nr)
    if compact is not None:
        variants.update({compact, f"§ {compact}", f"§{compact}"})
    return variants


def _cache_lookup_key(jurabk: str, paragraph_nr: str) -> tuple[str, str]:
    return (jurabk, _deconstruction_cache_paragraph_key(paragraph_nr) or paragraph_nr.strip())


def _cache_query_keys(norms: list[LawDbNormPayload]) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for norm in norms:
        jurabk = norm.jurabk
        for paragraph_variant in _paragraph_cache_variants(norm.paragraph_nr):
            keys.add((jurabk, paragraph_variant))
    return keys


def _next_offset(*, offset: int, limit: int | None, returned_count: int, total: int) -> int | None:
    if limit is None:
        return None
    next_offset = offset + returned_count
    return next_offset if next_offset < total else None


def _validate_norms(raw_norms: object, limit: int | None = None) -> list[LawDbNormPayload]:
    if not isinstance(raw_norms, list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Law database returned an invalid norms payload.")

    norms: list[LawDbNormPayload] = []
    selected_norms = raw_norms if limit is None else raw_norms[:limit]
    for index, norm in enumerate(selected_norms):
        try:
            norms.append(LawDbNormPayload.model_validate(norm))
        except ValidationError as exc:
            logger.warning("Law database returned invalid norm payload at index %s: %s", index, exc)
            raise _http_error(
                status.HTTP_502_BAD_GATEWAY,
                f"Law database returned an invalid norm payload at index {index}.",
            ) from exc
    return norms


def _validate_toc_entries(raw_toc_entries: object) -> list[LawDbTocPayload]:
    if not isinstance(raw_toc_entries, list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Law database returned an invalid table of contents payload.")

    toc_entries: list[LawDbTocPayload] = []
    for index, toc_entry in enumerate(raw_toc_entries):
        try:
            toc_entries.append(LawDbTocPayload.model_validate(toc_entry))
        except ValidationError as exc:
            logger.warning("Law database returned invalid table of contents payload at index %s: %s", index, exc)
            raise _http_error(
                status.HTTP_502_BAD_GATEWAY,
                f"Law database returned an invalid table of contents payload at index {index}.",
            ) from exc
    return toc_entries


def _sort_text(value: str | None) -> str:
    return (value or "").casefold()


def _legal_basis_norm_sort_key(norm: LawDbNormPayload) -> tuple[str, str, str, str, str, str]:
    normalized_paragraph_nr = _normalize_paragraph_nr(norm.paragraph_nr) or norm.paragraph_nr
    return (
        _sort_text(norm.jurabk),
        _sort_text(normalized_paragraph_nr),
        _sort_text(norm.doknr),
        _sort_text(norm.bundesland),
        _sort_text(norm.dokument_typ),
        _sort_text(norm.titel),
    )


def _paginate_norm_payloads(
    norms: list[LawDbNormPayload],
    *,
    limit: int | None,
    offset: int,
) -> LawDbNormPayloadPage:
    ordered_norms = sorted(norms, key=_legal_basis_norm_sort_key)
    total = len(ordered_norms)
    end = None if limit is None else offset + limit
    return LawDbNormPayloadPage(items=ordered_norms[offset:end], total=total)


def _id_part(value: str | None) -> str:
    return quote(value or "_", safe="")


def _law_group_id(jurabk: str, bundesland: str | None) -> str:
    return f"law-db-gesetz:{_id_part(bundesland or 'bund')}:{_id_part(jurabk)}"


def _norm_id(jurabk: str, paragraph_nr: str, bundesland: str | None) -> str:
    return f"law-db-norm:{_id_part(bundesland or 'bund')}:{_id_part(jurabk)}:{_id_part(paragraph_nr)}"


async def _get_cached_norm_deconstructions(
    db: AsyncSession,
    norms: list[LawDbNormPayload],
) -> dict[tuple[str, str], CachedNormDeconstruction]:
    keys = _cache_query_keys(norms)
    if not keys:
        return {}

    query_keys = sorted(keys)
    result = await db.execute(
        _DECONSTRUCTION_CACHE_QUERY,
        {
            "jurabks": [key[0] for key in query_keys],
            "paragraphs": [key[1] for key in query_keys],
        },
    )
    cached_deconstructions: dict[tuple[str, str], CachedNormDeconstruction] = {}
    for row in result.all():
        lookup_key = _cache_lookup_key(row[1], row[2])
        deconstruction = CachedNormDeconstruction(
            id=row[0],
            jurabk=row[1],
            paragraph=row[2],
            created_at=row[3],
        )
        cached_deconstruction = cached_deconstructions.get(lookup_key)
        if cached_deconstruction is None or deconstruction.created_at > cached_deconstruction.created_at:
            cached_deconstructions[lookup_key] = deconstruction
    return cached_deconstructions


def _to_legal_basis_norm(
    norm: LawDbNormPayload,
    document: LawDbDocumentPayload | None,
    cached_deconstruction: CachedNormDeconstruction | None,
) -> LegalBasisNormResponse:
    jurabk = norm.jurabk
    paragraph_nr = norm.paragraph_nr
    bundesland = (document.bundesland if document else None) or norm.bundesland
    doknr = norm.doknr or (document.doknr if document else None)
    dokument_typ = (document.doktyp if document else None) or norm.dokument_typ
    gesetz_titel = (document.langue or document.titel) if document else None
    gesetz_kurztitel = (document.kurzue or document.kurztitel) if document else None
    gesetz_name = str(gesetz_kurztitel or gesetz_titel or jurabk)
    gesetz_id = _law_group_id(jurabk, str(bundesland) if bundesland else None)
    paragraph_titel = norm.titel
    text = norm.paragraph_text
    standangaben = (
        [
            LegalBasisStandangabeResponse(
                standtyp=standangabe.standtyp,
                standkommentar=standangabe.standkommentar,
            )
            for standangabe in document.standangaben
        ]
        if document
        else []
    )

    return LegalBasisNormResponse(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        paragraph_titel=paragraph_titel,
        gesetz_titel=gesetz_titel,
        gesetz_kurztitel=gesetz_kurztitel,
        doknr=doknr,
        bundesland=bundesland,
        dokument_typ=dokument_typ,
        gesetz=LegalBasisLawResponse(
            id=gesetz_id,
            name=gesetz_name,
            jurabk=jurabk,
            titel=gesetz_titel,
            kurztitel=gesetz_kurztitel,
            doknr=doknr,
            bundesland=bundesland,
            dokument_typ=dokument_typ,
            fundstelle=document.fundstelle if document else None,
            standangaben=standangaben,
        ),
        norm=LegalBasisNormInfoResponse(
            id=_norm_id(jurabk, paragraph_nr, str(bundesland) if bundesland else None),
            gesetz_id=gesetz_id,
            paragraph_nr=paragraph_nr,
            paragraph_titel=paragraph_titel,
            text=text,
            regelungsgegenstand=None,
            doknr=doknr,
            prev=norm.prev,
            next=norm.next,
        ),
        is_deconstructed=cached_deconstruction is not None,
        deconstruction_id=cached_deconstruction.id if cached_deconstruction else None,
        deconstruction_created_at=cached_deconstruction.created_at if cached_deconstruction else None,
    )


def _update_type_value(update_type: object | None) -> str | None:
    if update_type is None:
        return None
    if isinstance(update_type, UpdateType):
        return update_type.value
    return str(update_type).lower()


def _timestamp_attr(model: object, name: str) -> datetime:
    return cast(datetime, getattr(model, name))


def _to_project_law_response(gesetz: Gesetz) -> ProjectLegalBasisLawResponse:
    return ProjectLegalBasisLawResponse(
        id=gesetz.id,
        project_id=gesetz.project_id,
        project_version=gesetz.project_version,
        name=gesetz.name,
        jurabk=gesetz.jurabk,
        frontend_parent_ids=list(gesetz.frontend_parent_ids or []),
        is_deleted=gesetz.is_deleted,
        is_outdated=gesetz.is_outdated,
        update_type=_update_type_value(gesetz.update_type),
        created_at=_timestamp_attr(gesetz, "created_at"),
        updated_at=_timestamp_attr(gesetz, "updated_at"),
    )


def _to_project_norm_response(norm: Norm) -> ProjectLegalBasisNormResponse:
    return ProjectLegalBasisNormResponse(
        id=norm.id,
        project_id=norm.project_id,
        project_version=norm.project_version,
        gesetz_id=norm.gesetz_id,
        paragraph_nr=norm.paragraph_nr,
        paragraph_titel=norm.paragraph_titel,
        text=norm.text,
        regelungsgegenstand=norm.regelungsgegenstand,
        frontend_parent_ids=list(norm.frontend_parent_ids or []),
        is_deleted=norm.is_deleted,
        is_outdated=norm.is_outdated,
        update_type=_update_type_value(norm.update_type),
        created_at=_timestamp_attr(norm, "created_at"),
        updated_at=_timestamp_attr(norm, "updated_at"),
    )


def _topic_norm_value(topic_norm: dict[str, Any], name: str) -> Any:
    camel_names = {
        "topic_id": "topicId",
        "project_id": "projectId",
        "project_version": "projectVersion",
        "paragraph_nr": "paragraphNr",
        "mvp_status": "mvpStatus",
        "satz_statuses": "satzStatuses",
        "frontend_parent_ids": "frontendParentIds",
        "is_deleted": "isDeleted",
        "is_outdated": "isOutdated",
        "update_type": "updateType",
        "created_at": "createdAt",
        "updated_at": "updatedAt",
    }
    if name in topic_norm:
        return topic_norm[name]
    return topic_norm.get(camel_names.get(name, name))


def _none_if_blank(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _same_optional_text(left: object, right: str | None) -> bool:
    left_normalized = _none_if_blank(str(left)) if left is not None else None
    return left_normalized == _none_if_blank(right)


def _topic_norm_matches(
    topic_norm: dict[str, Any],
    *,
    topic_id: uuid.UUID,
    jurabk: str,
    paragraph_nr: str,
    absatz: str | None,
    satz: str | None,
    nummer: str | None,
) -> bool:
    topic_norm_topic_id = _topic_norm_value(topic_norm, "topic_id")
    topic_norm_paragraph_nr = _topic_norm_value(topic_norm, "paragraph_nr")
    return (
        str(topic_norm_topic_id) == str(topic_id)
        and _topic_norm_value(topic_norm, "jurabk") == jurabk
        and _normalize_paragraph_nr(str(topic_norm_paragraph_nr)) == _normalize_paragraph_nr(paragraph_nr)
        and _same_optional_text(_topic_norm_value(topic_norm, "absatz"), absatz)
        and _same_optional_text(_topic_norm_value(topic_norm, "satz"), satz)
        and _same_optional_text(_topic_norm_value(topic_norm, "nummer"), nummer)
    )


def _to_project_topic_norm_response(topic_norm: dict[str, Any]) -> ProjectLegalBasisTopicNormResponse:
    return ProjectLegalBasisTopicNormResponse(
        id=_topic_norm_value(topic_norm, "id"),
        topic_id=_topic_norm_value(topic_norm, "topic_id"),
        project_id=_topic_norm_value(topic_norm, "project_id"),
        project_version=_topic_norm_value(topic_norm, "project_version"),
        jurabk=_topic_norm_value(topic_norm, "jurabk"),
        paragraph_nr=_topic_norm_value(topic_norm, "paragraph_nr"),
        type=_topic_norm_value(topic_norm, "type"),
        absatz=_topic_norm_value(topic_norm, "absatz"),
        satz=_topic_norm_value(topic_norm, "satz"),
        nummer=_topic_norm_value(topic_norm, "nummer"),
        mvp_status=_topic_norm_value(topic_norm, "mvp_status"),
        satz_statuses=_topic_norm_value(topic_norm, "satz_statuses") or {},
        frontend_parent_ids=_topic_norm_value(topic_norm, "frontend_parent_ids") or [],
        is_deleted=_topic_norm_value(topic_norm, "is_deleted"),
        is_outdated=_topic_norm_value(topic_norm, "is_outdated"),
        update_type=_update_type_value(_topic_norm_value(topic_norm, "update_type")),
        created_at=_topic_norm_value(topic_norm, "created_at"),
        updated_at=_topic_norm_value(topic_norm, "updated_at"),
    )


async def _ensure_project_logic_topic_belongs_to_project(
    *,
    project_id: uuid.UUID,
    topic_id: uuid.UUID,
) -> None:
    raw_topic = await _project_logic_json("GET", f"/topics/{topic_id}")
    if not isinstance(raw_topic, dict):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned an invalid topic payload.")

    topic_project_id = raw_topic.get("project_id") or raw_topic.get("projectId")
    if str(topic_project_id) != str(project_id):
        raise _http_error(status.HTTP_404_NOT_FOUND, "Topic does not belong to this project.")


async def _batch_get_project_logic_topic_norm(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_norm_id: uuid.UUID,
) -> dict[str, Any]:
    nodes = await _batch_get_project_logic_topic_norms(
        project_id=project_id,
        project_version=project_version,
        topic_norm_ids=[topic_norm_id],
    )
    for node in nodes:
        if str(_topic_norm_value(node, "id")) == str(topic_norm_id):
            return node
    raise _http_error(status.HTTP_404_NOT_FOUND, "Project Logic topic_norm not found.")


async def _batch_get_project_logic_topic_norms(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_norm_ids: list[uuid.UUID],
) -> list[dict[str, Any]]:
    if not topic_norm_ids:
        return []

    raw_nodes = await _project_logic_json(
        "POST",
        f"/{project_id}/batch-nodes",
        params={"project_version": project_version},
        json_body={
            "nodes": [{"node_type": "topic_norm", "id": str(topic_norm_id)} for topic_norm_id in topic_norm_ids]
        },
    )
    if not isinstance(raw_nodes, dict) or not isinstance(raw_nodes.get("results"), list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned an invalid batch-nodes payload.")

    return [node for node in raw_nodes["results"] if isinstance(node, dict) and node.get("node_type") == "topic_norm"]


def _node_has_parent(node: dict[str, Any], *, parent_id: uuid.UUID, parent_type: str) -> bool:
    parents = node.get("parents")
    if not isinstance(parents, list):
        return False
    return any(
        isinstance(parent, dict) and str(parent.get("id")) == str(parent_id) and parent.get("node_type") == parent_type
        for parent in parents
    )


async def _find_project_logic_topic_norm_from_nodes(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_id: uuid.UUID,
    jurabk: str,
    paragraph_nr: str,
    absatz: str | None,
    satz: str | None,
    nummer: str | None,
) -> dict[str, Any] | None:
    raw_nodes = await _project_logic_json("GET", f"/{project_id}/nodes", params={"project_version": project_version})
    if not isinstance(raw_nodes, dict) or not isinstance(raw_nodes.get("nodes"), list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned an invalid nodes payload.")

    topic_norm_ids = [
        uuid.UUID(str(node["id"]))
        for node in raw_nodes["nodes"]
        if isinstance(node, dict)
        and node.get("node_type") == "topic_norm"
        and node.get("id") is not None
        and _node_has_parent(node, parent_id=topic_id, parent_type="topic")
    ]
    topic_norms = await _batch_get_project_logic_topic_norms(
        project_id=project_id,
        project_version=project_version,
        topic_norm_ids=topic_norm_ids,
    )
    for topic_norm in topic_norms:
        if _topic_norm_matches(
            topic_norm,
            topic_id=topic_id,
            jurabk=jurabk,
            paragraph_nr=paragraph_nr,
            absatz=absatz,
            satz=satz,
            nummer=nummer,
        ):
            return topic_norm
    return None


async def _find_project_logic_topic_norm(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_id: uuid.UUID,
    jurabk: str,
    paragraph_nr: str,
    absatz: str | None,
    satz: str | None,
    nummer: str | None,
) -> dict[str, Any] | None:
    raw_topic_norms = await _project_logic_json("GET", f"/topics/{topic_id}/norms")
    if not isinstance(raw_topic_norms, list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned an invalid topic norms payload.")

    matched_topic_norm_without_id = False
    for topic_norm in raw_topic_norms:
        if not isinstance(topic_norm, dict):
            continue
        if not _topic_norm_matches(
            topic_norm,
            topic_id=topic_id,
            jurabk=jurabk,
            paragraph_nr=paragraph_nr,
            absatz=absatz,
            satz=satz,
            nummer=nummer,
        ):
            continue
        topic_norm_id = _topic_norm_value(topic_norm, "id")
        if topic_norm_id is None:
            matched_topic_norm_without_id = True
            continue
        return await _batch_get_project_logic_topic_norm(
            project_id=project_id,
            project_version=project_version,
            topic_norm_id=uuid.UUID(str(topic_norm_id)),
        )
    if matched_topic_norm_without_id:
        return await _find_project_logic_topic_norm_from_nodes(
            project_id=project_id,
            project_version=project_version,
            topic_id=topic_id,
            jurabk=jurabk,
            paragraph_nr=paragraph_nr,
            absatz=absatz,
            satz=satz,
            nummer=nummer,
        )
    return None


async def _create_project_logic_topic_norm(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_id: uuid.UUID,
    jurabk: str,
    paragraph_nr: str,
    norm_type: str,
    absatz: str | None,
    satz: str | None,
    nummer: str | None,
) -> dict[str, Any]:
    satz_statuses: dict[str, str] = {}
    frontend_parent_ids: list[str] = []
    updates: list[dict[str, Any]] = []
    deletes: list[dict[str, Any]] = []
    payload = {
        "inserts": [
            {
                "node_type": "topic_norm",
                "payload": {
                    "topic_id": str(topic_id),
                    "jurabk": jurabk,
                    "paragraph_nr": paragraph_nr,
                    "type": norm_type,
                    "absatz": absatz,
                    "satz": satz,
                    "nummer": nummer,
                    "mvp_status": "unchecked",
                    "satz_statuses": satz_statuses,
                    "frontend_parent_ids": frontend_parent_ids,
                    "update_type": "manual",
                },
            }
        ],
        "updates": updates,
        "deletes": deletes,
    }
    raw_update = await _project_logic_json(
        "POST",
        f"/{project_id}/update",
        params={"project_version": project_version},
        json_body=payload,
    )
    if not isinstance(raw_update, dict) or not isinstance(raw_update.get("inserted"), list):
        raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic returned an invalid update payload.")

    for node in raw_update["inserted"]:
        if isinstance(node, dict) and node.get("node_type") == "topic_norm":
            return node
    raise _http_error(status.HTTP_502_BAD_GATEWAY, "Project Logic did not return the inserted topic_norm.")


async def _get_or_create_project_logic_topic_norm(
    *,
    project_id: uuid.UUID,
    project_version: int,
    topic_id: uuid.UUID,
    norm_type: str,
    law_db_norm: LegalBasisNormResponse,
) -> tuple[ProjectLegalBasisTopicNormResponse, bool]:
    paragraph_nr = _normalize_paragraph_nr(law_db_norm.paragraph_nr) or law_db_norm.paragraph_nr
    absatz = None
    satz = None
    nummer = None

    existing = await _find_project_logic_topic_norm(
        project_id=project_id,
        project_version=project_version,
        topic_id=topic_id,
        jurabk=law_db_norm.jurabk,
        paragraph_nr=paragraph_nr,
        absatz=absatz,
        satz=satz,
        nummer=nummer,
    )
    if existing is not None:
        return _to_project_topic_norm_response(existing), False

    created = await _create_project_logic_topic_norm(
        project_id=project_id,
        project_version=project_version,
        topic_id=topic_id,
        jurabk=law_db_norm.jurabk,
        paragraph_nr=paragraph_nr,
        norm_type=norm_type,
        absatz=absatz,
        satz=satz,
        nummer=nummer,
    )
    return _to_project_topic_norm_response(created), True


async def _ensure_norm_has_topic_norm_parent(
    db: AsyncSession,
    norm: Norm,
    topic_norm_id: uuid.UUID,
) -> None:
    parent_id = f"topic_norm:{topic_norm_id}"
    parent_ids = list(norm.frontend_parent_ids or [])
    if parent_id in parent_ids:
        return
    norm.frontend_parent_ids = [*parent_ids, parent_id]
    await db.flush()


async def _fetch_law_db_norm_payloads(
    *,
    jurabk: str | None,
    paragraph_nr: str | None,
    doknr: str | None,
    bundesland: str | None,
    limit: int | None,
) -> list[LawDbNormPayload]:
    params: dict[str, Any] = {
        "include_absaetze": False,
    }
    if jurabk:
        params["jurabk"] = jurabk
    normalized_paragraph_nr = _normalize_paragraph_nr(paragraph_nr)
    if normalized_paragraph_nr:
        params["paragraph_nr"] = normalized_paragraph_nr
    if doknr:
        params["doknr"] = doknr
    if bundesland:
        params["bundesland"] = bundesland

    raw_norms = await _get_json("/norms/search", params=params)
    return _validate_norms(raw_norms, limit)


async def _fetch_law_db_toc_payloads() -> list[LawDbTocPayload]:
    raw_toc_entries = await _get_json("/toc/")
    return _validate_toc_entries(raw_toc_entries)


async def _fetch_legal_basis_norms_from_toc(
    *,
    db: AsyncSession,
    paragraph_nr: str | None,
    bundesland: str | None,
    limit: int | None,
    offset: int,
) -> LegalBasisNormPage:
    documents = await _get_documents_metadata(bundesland)
    documents_by_doknr = {document.doknr: document for document in documents if document.doknr}
    documents_by_jurabk = {
        (document.jurabk, document.bundesland): document for document in documents if document.jurabk
    }

    normalized_paragraph_nr = _normalize_paragraph_nr(paragraph_nr)
    norm_payloads_and_documents: list[tuple[LawDbNormPayload, LawDbDocumentPayload | None]] = []
    for toc_entry in await _fetch_law_db_toc_payloads():
        if toc_entry.paragraph_typ != "§":
            continue
        toc_paragraph_nr = _normalize_paragraph_nr(toc_entry.paragraph_nr)
        if toc_paragraph_nr is None:
            continue
        if normalized_paragraph_nr is not None and toc_paragraph_nr != normalized_paragraph_nr:
            continue

        document = documents_by_doknr.get(toc_entry.doknr) if toc_entry.doknr else None
        if document is None:
            document = documents_by_jurabk.get((toc_entry.jurabk, bundesland))
        if document is None:
            continue

        norm_payloads_and_documents.append(
            (
                LawDbNormPayload(
                    jurabk=toc_entry.jurabk,
                    paragraph_nr=toc_paragraph_nr,
                    titel=toc_entry.text or toc_entry.title,
                    paragraph_text=toc_entry.text or toc_entry.title or "",
                    doknr=toc_entry.doknr,
                    bundesland=document.bundesland,
                    dokument_typ=document.doktyp,
                ),
                document,
            )
        )

    ordered_norm_payloads_and_documents = sorted(
        norm_payloads_and_documents,
        key=lambda norm_and_document: _legal_basis_norm_sort_key(norm_and_document[0]),
    )
    total = len(ordered_norm_payloads_and_documents)
    end = None if limit is None else offset + limit
    page_norm_payloads_and_documents = ordered_norm_payloads_and_documents[offset:end]
    norm_payloads = [norm for norm, _document in page_norm_payloads_and_documents]

    cached_deconstructions = await _get_cached_norm_deconstructions(db, norm_payloads)
    items = [
        _to_legal_basis_norm(
            norm,
            document,
            cached_deconstructions.get(_cache_lookup_key(norm.jurabk, norm.paragraph_nr)),
        )
        for norm, document in page_norm_payloads_and_documents
    ]
    return LegalBasisNormPage(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        next_offset=_next_offset(offset=offset, limit=limit, returned_count=len(items), total=total),
    )


async def _get_existing_project_law(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    project_version: int,
    jurabk: str,
) -> Gesetz | None:
    return await db.scalar(
        select(Gesetz).where(
            Gesetz.project_id == project_id,
            Gesetz.project_version == project_version,
            Gesetz.jurabk == jurabk,
            Gesetz.is_deleted.is_(False),
        )
    )


async def _get_or_create_project_law(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    project_version: int,
    law_db_norm: LegalBasisNormResponse,
) -> tuple[Gesetz, bool]:
    existing = await _get_existing_project_law(
        db,
        project_id=project_id,
        project_version=project_version,
        jurabk=law_db_norm.jurabk,
    )
    if existing is not None:
        return existing, False

    gesetz = Gesetz()
    gesetz.id = uuid.uuid4()
    gesetz.project_id = project_id
    gesetz.project_version = project_version
    gesetz.name = law_db_norm.gesetz.name
    gesetz.jurabk = law_db_norm.jurabk
    gesetz.update_type = UpdateType.MANUAL
    db.add(gesetz)
    await db.flush()
    return gesetz, True


async def _get_existing_project_norm(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    project_version: int,
    gesetz_id: uuid.UUID,
    paragraph_nr: str,
) -> Norm | None:
    return await db.scalar(
        select(Norm).where(
            Norm.project_id == project_id,
            Norm.project_version == project_version,
            Norm.gesetz_id == gesetz_id,
            Norm.paragraph_nr == paragraph_nr,
            Norm.is_deleted.is_(False),
        )
    )


async def _get_or_create_project_norm(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    project_version: int,
    gesetz_id: uuid.UUID,
    law_db_norm: LegalBasisNormResponse,
) -> tuple[Norm, bool]:
    existing = await _get_existing_project_norm(
        db,
        project_id=project_id,
        project_version=project_version,
        gesetz_id=gesetz_id,
        paragraph_nr=law_db_norm.paragraph_nr,
    )
    if existing is not None:
        return existing, False

    norm_text = law_db_norm.norm.text
    if not norm_text:
        raise _http_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Law database norm has no text and cannot be added to the project.",
        )

    norm = Norm()
    norm.id = uuid.uuid4()
    norm.project_id = project_id
    norm.project_version = project_version
    norm.gesetz_id = gesetz_id
    norm.paragraph_nr = law_db_norm.paragraph_nr
    norm.text = norm_text
    norm.update_type = UpdateType.MANUAL
    if law_db_norm.paragraph_titel is not None:
        norm.paragraph_titel = law_db_norm.paragraph_titel
    if law_db_norm.norm.regelungsgegenstand is not None:
        norm.regelungsgegenstand = law_db_norm.norm.regelungsgegenstand
    db.add(norm)
    await db.flush()
    return norm, True


async def _get_single_law_db_norm(
    db: AsyncSession,
    selection: LegalBasisNormSelection,
) -> LegalBasisNormResponse:
    jurabk = selection.jurabk.strip()
    paragraph_nr = _normalize_paragraph_nr(selection.paragraph_nr)
    if not jurabk:
        raise _http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "jurabk must not be empty.")
    if paragraph_nr is None:
        raise _http_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "paragraph_nr must not be empty.")

    matches = await _fetch_law_db_norm_payloads(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        doknr=None,
        bundesland=None,
        limit=2,
    )
    if not matches:
        raise _http_error(status.HTTP_404_NOT_FOUND, "No matching law database norm found.")
    if len(matches) > 1:
        raise _http_error(
            status.HTTP_409_CONFLICT,
            "Multiple law database norms matched for the selected jurabk and paragraph_nr.",
        )
    law_db_norm = matches[0]
    cached_deconstructions = await _get_cached_norm_deconstructions(db, [law_db_norm])
    document = await _get_document_metadata(law_db_norm.jurabk, law_db_norm.bundesland)
    return _to_legal_basis_norm(
        law_db_norm,
        document,
        cached_deconstructions.get(_cache_lookup_key(law_db_norm.jurabk, law_db_norm.paragraph_nr)),
    )


def _ensure_law_db_norm_can_be_materialized(law_db_norm: LegalBasisNormResponse) -> None:
    if law_db_norm.norm.text:
        return
    raise _http_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Law database norm has no text and cannot be added to the project.",
    )


async def _materialize_legal_basis_norm(
    *,
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    topic_id: uuid.UUID,
    norm_type: str,
    law_db_norm: LegalBasisNormResponse,
) -> LegalBasisAddNormItemResponse:
    topic_norm, created_topic_norm = await _get_or_create_project_logic_topic_norm(
        project_id=project_id,
        project_version=project_version,
        topic_id=topic_id,
        norm_type=norm_type,
        law_db_norm=law_db_norm,
    )
    gesetz, created_gesetz = await _get_or_create_project_law(
        db,
        project_id=project_id,
        project_version=project_version,
        law_db_norm=law_db_norm,
    )
    norm, created_norm = await _get_or_create_project_norm(
        db,
        project_id=project_id,
        project_version=project_version,
        gesetz_id=gesetz.id,
        law_db_norm=law_db_norm,
    )
    await _ensure_norm_has_topic_norm_parent(db, norm, topic_norm.id)

    return LegalBasisAddNormItemResponse(
        gesetz=_to_project_law_response(gesetz),
        norm=_to_project_norm_response(norm),
        topic_norm=topic_norm,
        created_gesetz=created_gesetz,
        created_norm=created_norm,
        created_topic_norm=created_topic_norm,
        is_deconstructed=law_db_norm.is_deconstructed,
        deconstruction_id=law_db_norm.deconstruction_id,
        deconstruction_created_at=law_db_norm.deconstruction_created_at,
    )


async def add_legal_basis_norm_to_project(
    *,
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    payload: LegalBasisAddNormRequest,
) -> LegalBasisAddNormResponse:
    law_db_norms = []
    for selection in payload.norms:
        law_db_norm = await _get_single_law_db_norm(db, selection)
        _ensure_law_db_norm_can_be_materialized(law_db_norm)
        law_db_norms.append(law_db_norm)

    await _ensure_project_logic_topic_belongs_to_project(
        project_id=project_id,
        topic_id=payload.topic_id,
    )

    items = [
        await _materialize_legal_basis_norm(
            db=db,
            project_id=project_id,
            project_version=project_version,
            topic_id=payload.topic_id,
            norm_type=payload.type,
            law_db_norm=law_db_norm,
        )
        for law_db_norm in law_db_norms
    ]
    await db.commit()

    return LegalBasisAddNormResponse(items=items)


async def fetch_legal_basis_norm_page(
    *,
    db: AsyncSession,
    jurabk: str | None,
    paragraph_nr: str | None,
    doknr: str | None,
    bundesland: str | None,
    limit: int | None,
    offset: int,
) -> LegalBasisNormPage:
    if not (jurabk or doknr):
        return await _fetch_legal_basis_norms_from_toc(
            db=db,
            paragraph_nr=paragraph_nr,
            bundesland=bundesland,
            limit=limit,
            offset=offset,
        )

    all_norms = await _fetch_law_db_norm_payloads(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        doknr=doknr,
        bundesland=bundesland,
        limit=None,
    )
    norm_page = _paginate_norm_payloads(all_norms, limit=limit, offset=offset)
    norms = norm_page.items
    cached_deconstructions = await _get_cached_norm_deconstructions(db, norms)
    documents: dict[tuple[str, str | None], LawDbDocumentPayload] = {}
    for norm in norms:
        document_key = (norm.jurabk, bundesland or norm.bundesland)
        if document_key not in documents:
            documents[document_key] = await _get_document_metadata(*document_key)

    items = [
        _to_legal_basis_norm(
            norm,
            documents.get((norm.jurabk, bundesland or norm.bundesland)),
            cached_deconstructions.get(_cache_lookup_key(norm.jurabk, norm.paragraph_nr)),
        )
        for norm in norms
    ]
    return LegalBasisNormPage(
        items=items,
        total=norm_page.total,
        offset=offset,
        limit=limit,
        next_offset=_next_offset(offset=offset, limit=limit, returned_count=len(items), total=norm_page.total),
    )


async def fetch_legal_basis_norms(
    *,
    db: AsyncSession,
    jurabk: str | None,
    paragraph_nr: str | None,
    doknr: str | None,
    bundesland: str | None,
    limit: int | None,
) -> list[LegalBasisNormResponse]:
    page = await fetch_legal_basis_norm_page(
        db=db,
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        doknr=doknr,
        bundesland=bundesland,
        limit=limit,
        offset=0,
    )
    return page.items
