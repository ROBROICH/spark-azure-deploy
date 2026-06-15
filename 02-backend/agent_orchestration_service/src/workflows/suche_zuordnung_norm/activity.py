"""Activities for SucheZuordnungNormWorkflow."""

import asyncio
from collections import defaultdict
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Absatz as NormAbsatz,
)
from temporal.workflows.modul_suche_und_zuordnung.types import (
    AtomaresTBM,
    Document,
    NormData,
)
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Satz as NormSatz,
)
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.services.api_clients import ExaminationServiceClient
from src.workflows.suche_zuordnung_norm.helpers import (
    build_document_nodes_from_exam_data,
    get_nodes_by_type,
    index_exam_data,
    resolve_nodes,
)


def _sort_nr(nr: str) -> tuple[int, int, str]:
    """Sort key for absatz_nr / satz_nr — numeric strings sort numerically."""
    try:
        return (0, int(nr), "")
    except ValueError:
        return (1, 0, nr)


class FetchNormExaminationIdsInput(BaseModel):
    project_id: str
    norm_id: str


class NormExaminationIds(BaseModel):
    gesetz_id: str
    satz_id_lookup: dict[str, str]  # "{absatz_nr}:{satz_nr}:{position}" -> satz_id


def _resolved_satz_position(satz: dict[str, object], fallback_position: int) -> int:
    raw_position = satz.get("position")
    if raw_position is None:
        return fallback_position
    return int(cast("str | int", raw_position))


def _satz_sort_key(satz: dict[str, object]) -> tuple[int, int, tuple[int, int, str], str, str]:
    raw_position = satz.get("position")
    position = int(cast("str | int", raw_position)) if raw_position is not None else 0
    return (
        1 if raw_position is None else 0,
        position,
        _sort_nr(str(satz.get("satz_nr", ""))),
        str(satz.get("created_at", "")),
        str(satz.get("id", "")),
    )


def _satz_lookup_key(absatz_nr: str, satz_nr: str, position: int) -> str:
    return f"{absatz_nr}:{satz_nr}:{position}"


async def _empty_nodes() -> list[dict[str, Any]]:
    return []


_RETRY = RetryPolicy(
    maximum_attempts=3,
    initial_interval=timedelta(seconds=10),
    backoff_coefficient=2,
)


class FetchDocumentNodesInput(BaseModel):
    project_id: str


@activity.defn(name="fetch_document_nodes")
async def _fetch_document_nodes(input: FetchDocumentNodesInput) -> list[Document]:
    """Fetch document node structures from the examination service.

    Uses only 5 HTTP calls total regardless of project size:
      1. list_nodes → lightweight graph
      2. resolve all dokument nodes
      3. resolve all chunk nodes
      4. resolve all sub_chunk nodes
      5. resolve all markdown_text nodes
    """
    project_id = input.project_id
    graph = await ExaminationServiceClient.list_nodes(UUID(project_id))
    all_nodes = graph.get("nodes", [])

    activity.logger.info("Found %d total nodes for project %s", len(all_nodes), project_id)

    # Resolve each node type in one batch call (4 calls total)
    dokumente = await resolve_nodes(project_id, get_nodes_by_type(all_nodes, "dokument"))
    dokumente.sort(key=lambda d: str(d.get("id", "")))
    activity.heartbeat("Resolved dokument nodes")

    all_chunks = await resolve_nodes(project_id, get_nodes_by_type(all_nodes, "chunk"))
    activity.heartbeat("Resolved chunk nodes")

    all_sub_chunks = await resolve_nodes(project_id, get_nodes_by_type(all_nodes, "sub_chunk"))
    activity.heartbeat("Resolved sub_chunk nodes")

    all_md_texts = await resolve_nodes(project_id, get_nodes_by_type(all_nodes, "markdown_text"))
    activity.heartbeat("Resolved markdown_text nodes")

    activity.logger.info(
        "Resolved %d dokumente, %d chunks, %d sub_chunks, %d markdown_texts",
        len(dokumente),
        len(all_chunks),
        len(all_sub_chunks),
        len(all_md_texts),
    )

    # Index and build
    chunks_by_doc, sub_chunks_by_chunk, md_by_id = index_exam_data(all_chunks, all_sub_chunks, all_md_texts)

    documents = build_document_nodes_from_exam_data(dokumente, chunks_by_doc, sub_chunks_by_chunk, md_by_id)

    total_nodes = sum(len(d.nodes) for d in documents)
    activity.logger.info(
        "Built %d documents with %d total nodes from examination service",
        len(documents),
        total_nodes,
    )

    return documents


# Activity wrapper for use inside workflow code
async def fetch_document_nodes(input: FetchDocumentNodesInput) -> list[Document]:
    return await workflow.execute_activity(
        _fetch_document_nodes,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=_RETRY,
    )


@activity.defn(name="fetch_norm_examination_ids")
async def _fetch_norm_examination_ids(input: FetchNormExaminationIdsInput) -> NormExaminationIds:
    """Fetch gesetz_id and satz_id lookup for a given norm from the examination service.

    Resolves the norm node to obtain gesetz_id, then traverses absatz → satz nodes
    to build a lookup keyed by "{absatz_nr}:{satz_nr}:{position}" → satz_id.
    """
    project_id = input.project_id
    norm_id = input.norm_id

    # Fetch lightweight graph — single call, used for all node types
    graph = await ExaminationServiceClient.list_nodes(UUID(project_id))
    all_nodes = graph.get("nodes", [])

    # Derive gesetz_id from the norm node's parent ref in the lightweight graph
    # (avoids a batch_get_nodes call for the norm node)
    norm_ref = next(
        (n for n in get_nodes_by_type(all_nodes, "norm") if str(n["id"]) == norm_id),
        None,
    )
    if norm_ref is not None:
        gesetz_parent = next(
            (p for p in norm_ref.get("parents", []) if p.get("node_type") == "gesetz"),
            None,
        )
        if not gesetz_parent:
            raise RuntimeError(f"Norm node {norm_id} has no gesetz parent in project {project_id}")
        gesetz_id = str(gesetz_parent["id"])
    else:
        raise RuntimeError(f"Norm node {norm_id} not found in examination service for project {project_id}")

    # Resolve all absatz nodes and filter to those belonging to this norm
    absatz_refs = get_nodes_by_type(all_nodes, "absatz")
    all_absaetze = await resolve_nodes(project_id, absatz_refs)
    activity.heartbeat("Resolved absatz nodes")
    norm_absaetze = [a for a in all_absaetze if str(a.get("norm_id", "")) == norm_id]
    absatz_id_to_nr = {str(a["id"]): str(a["absatz_nr"]) for a in norm_absaetze}

    # Resolve all satz nodes and build the lookup
    satz_refs = get_nodes_by_type(all_nodes, "satz")
    all_saetze = await resolve_nodes(project_id, satz_refs)
    activity.heartbeat("Resolved satz nodes")

    satz_by_absatz: dict[str, list[dict[str, object]]] = defaultdict(list)
    for satz in all_saetze:
        absatz_id = str(satz.get("absatz_id", ""))
        if absatz_id in absatz_id_to_nr:
            satz_by_absatz[absatz_id].append(satz)

    satz_id_lookup: dict[str, str] = {}
    for absatz_id, saetze in satz_by_absatz.items():
        absatz_nr = absatz_id_to_nr[absatz_id]
        for fallback_position, satz in enumerate(sorted(saetze, key=_satz_sort_key)):
            satz_nr = str(satz.get("satz_nr", ""))
            position = _resolved_satz_position(satz, fallback_position)
            satz_id_lookup[_satz_lookup_key(absatz_nr, satz_nr, position)] = str(satz["id"])

    activity.logger.info(
        "Resolved norm %s: gesetz_id=%s, %d satz nodes mapped",
        norm_id,
        gesetz_id,
        len(satz_id_lookup),
    )

    return NormExaminationIds(gesetz_id=gesetz_id, satz_id_lookup=satz_id_lookup)


async def fetch_norm_examination_ids(input: FetchNormExaminationIdsInput) -> NormExaminationIds:
    return await workflow.execute_activity(
        _fetch_norm_examination_ids,
        input,
        start_to_close_timeout=timedelta(minutes=5),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=_RETRY,
    )


# ---------------------------------------------------------------------------
# fetch_norm_data — build NormData from the examination service hierarchy
# ---------------------------------------------------------------------------


class FetchNormDataInput(BaseModel):
    project_id: str
    norm_id: str


@activity.defn(name="fetch_norm_data")
async def _fetch_norm_data(input: FetchNormDataInput) -> NormData:
    """Build NormData by fetching the norm/gesetz/absatz/satz hierarchy from the examination service.

    Uses project_id only — norm_id (normdetail_id) is an external passthrough ID and is
    not used for the examination service lookup.
    """
    project_id = input.project_id

    graph = await ExaminationServiceClient.list_nodes(UUID(project_id))
    all_nodes = graph.get("nodes", [])

    # Find the norm node matching the given norm_id
    norm_refs = get_nodes_by_type(all_nodes, "norm")
    norm_ref = next((n for n in norm_refs if str(n["id"]) == input.norm_id), None)
    if norm_ref is None:
        raise RuntimeError(f"Norm {input.norm_id} not found in examination service for project {project_id}")
    exam_norm_id = str(norm_ref["id"])  # examination service's internal norm UUID

    # Derive gesetz ref from the norm's parent in the lightweight graph
    gesetz_parent = next(
        (p for p in norm_ref.get("parents", []) if p.get("node_type") == "gesetz"),
        None,
    )
    gesetz_ref = (
        next((n for n in get_nodes_by_type(all_nodes, "gesetz") if str(n["id"]) == str(gesetz_parent["id"])), None)
        if gesetz_parent
        else None
    )

    # Resolve norm, gesetz, absatz, satz, atomares_tbm concurrently
    absatz_refs = get_nodes_by_type(all_nodes, "absatz")
    satz_refs = get_nodes_by_type(all_nodes, "satz")
    atomares_tbm_refs = get_nodes_by_type(all_nodes, "atomares_tbm")
    norm_nodes, gesetz_nodes, all_absaetze, all_saetze, all_atomare_tbms = await asyncio.gather(
        resolve_nodes(project_id, [norm_ref]),
        resolve_nodes(project_id, [gesetz_ref]) if gesetz_ref else _empty_nodes(),
        resolve_nodes(project_id, absatz_refs),
        resolve_nodes(project_id, satz_refs),
        resolve_nodes(project_id, atomares_tbm_refs),
    )
    activity.heartbeat("Resolved all norm hierarchy nodes")

    norm_node = norm_nodes[0]
    gesetz_node = gesetz_nodes[0] if gesetz_nodes else {}

    # Filter absaetze belonging to this norm using the exam service's internal norm UUID
    norm_absaetze = [a for a in all_absaetze if str(a.get("norm_id", "")) == exam_norm_id]
    absatz_id_to_node = {str(a["id"]): a for a in norm_absaetze}

    satz_by_absatz: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for satz in all_saetze:
        absatz_id = str(satz.get("absatz_id", ""))
        if absatz_id in absatz_id_to_node:
            satz_by_absatz[absatz_id].append(satz)

    # Index atomares_tbm nodes by satz_id
    atomare_tbms_by_satz_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for atbm in all_atomare_tbms:
        satz_id = str(atbm.get("satz_id", ""))
        if satz_id:
            atomare_tbms_by_satz_id[satz_id].append(atbm)

    # Build NormData
    absaetze_out: list[NormAbsatz] = []
    for absatz_node in sorted(norm_absaetze, key=lambda a: _sort_nr(str(a.get("absatz_nr", "")))):
        absatz_id = str(absatz_node["id"])
        saetze_out: list[NormSatz] = []
        for fallback_position, satz_node in enumerate(sorted(satz_by_absatz.get(absatz_id, []), key=_satz_sort_key)):
            satz_id = str(satz_node["id"])
            tbms: object = satz_node.get("tatbestandsmerkmale") or []
            atomare_tbms = [
                AtomaresTBM(
                    id=UUID(str(atbm["id"])),
                    prueffrage=cast("str | None", atbm.get("prueffrage")),
                    rechtsbegriffe=None,
                )
                for atbm in atomare_tbms_by_satz_id.get(satz_id, [])
            ]
            norm_typ_lvl_1 = satz_node.get("norm_typ_lvl_1")
            norm_typ_lvl_2 = satz_node.get("norm_typ_lvl_2")
            saetze_out.append(
                NormSatz(
                    id=satz_id,
                    satz_nr=str(satz_node["satz_nr"]),
                    position=_resolved_satz_position(satz_node, fallback_position),
                    satz_text=str(satz_node.get("text", "")),
                    norm_typ_lvl_1=str(norm_typ_lvl_1) if norm_typ_lvl_1 is not None else None,
                    norm_typ_lvl_2=str(norm_typ_lvl_2) if norm_typ_lvl_2 is not None else None,
                    tatbestandsmerkmale=tbms if isinstance(tbms, list) else [],
                    atomare_tatbestandsmerkmale=atomare_tbms,
                )
            )
        absaetze_out.append(
            NormAbsatz(
                absatz_nr=str(absatz_node["absatz_nr"]),
                absatz_text=absatz_node.get("text", ""),
                saetze=saetze_out,
            )
        )

    result = NormData(
        gesetz=gesetz_node.get("name", ""),
        jurabk=gesetz_node.get("jurabk", ""),
        paragraph_nr=str(norm_node["paragraph_nr"]),
        paragraph_titel=norm_node.get("paragraph_titel") or "",
        absaetze=absaetze_out,
    )

    total_atomare_tbms = sum(len(s.atomare_tatbestandsmerkmale) for a in result.absaetze for s in a.saetze)
    activity.logger.info(
        "Built NormData for norm %s: %s § %s, %d absaetze, %d atomare TBMs",
        exam_norm_id,
        result.jurabk,
        result.paragraph_nr,
        len(result.absaetze),
        total_atomare_tbms,
    )
    return result


async def fetch_norm_data(input: FetchNormDataInput) -> NormData:
    return await workflow.execute_activity(
        _fetch_norm_data,
        input,
        start_to_close_timeout=timedelta(minutes=5),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=_RETRY,
    )
