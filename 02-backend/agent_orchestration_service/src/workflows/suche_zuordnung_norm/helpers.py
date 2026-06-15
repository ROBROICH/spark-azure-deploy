"""
Helpers for SucheZuordnungNormWorkflow.

Graph-traversal utilities for the examination service and
pure data-transformation helpers. No Temporal SDK calls.
"""

import logging
from collections import defaultdict
from typing import Any

from pydantic import ValidationError
from temporal.workflows.modul_suche_und_zuordnung.types import Document, DocumentNode, NormData

from src.services.api_clients import ExaminationServiceClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Examination service graph helpers
# ---------------------------------------------------------------------------


def get_nodes_by_type(nodes: list[dict[str, Any]], node_type: str) -> list[dict[str, Any]]:
    """Filter graph nodes by node_type."""
    return [n for n in nodes if n.get("node_type") == node_type]


def get_children(
    nodes: list[dict[str, Any]],
    parent_ref: dict[str, Any],
    child_node_type: str,
) -> list[dict[str, Any]]:
    """Get nodes of *child_node_type* whose parents include *parent_ref*."""
    parent_id = parent_ref["id"]
    parent_type = parent_ref["node_type"]
    return [
        n
        for n in nodes
        if n.get("node_type") == child_node_type
        and any(p.get("id") == parent_id and p.get("node_type") == parent_type for p in n.get("parents", []))
    ]


async def resolve_nodes(
    project_id: str,
    node_refs: list[dict[str, Any]],
    *,
    client: type = ExaminationServiceClient,
) -> list[dict[str, Any]]:
    """Resolve node references to full node data in one backend request."""
    if not node_refs:
        return []
    refs = [{"node_type": n["node_type"], "id": n["id"]} for n in node_refs]
    batch = await client.batch_get_nodes(project_id, refs)
    return batch.get("results", [])


# ---------------------------------------------------------------------------
# Document node builder
# ---------------------------------------------------------------------------


def _group_chunks_by_node(chunks: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group chunks by page_index_node_id, ordered by page_index_position within each group.

    Chunks without a node_id are treated as standalone nodes.
    Groups are ordered by the position of their first chunk in the original list.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    group_order: list[str] = []

    for chunk in chunks:
        node_id = chunk.get("page_index_node_id") or str(chunk["id"])
        if node_id not in groups:
            groups[node_id] = []
            group_order.append(node_id)
        groups[node_id].append(chunk)

    result = []
    for node_id in group_order:
        group = sorted(groups[node_id], key=lambda c: c.get("page_index_position") or 0)
        result.append(group)
    return result


def build_document_nodes_from_exam_data(
    dokumente: list[dict[str, Any]],
    chunks_by_doc: dict[str, list[dict[str, Any]]],
    sub_chunks_by_chunk: dict[str, list[dict[str, Any]]],
    md_by_id: dict[str, str],
) -> list[Document]:
    """Build Document/DocumentNode structures from examination service data.

    Groups chunks by page_index_node_id and uses position=0 chunk for node metadata
    (node_id, summary). Validates each DocumentNode via Pydantic and skips invalid nodes.
    """
    documents: list[Document] = []
    for dok in dokumente:
        dok_id = str(dok["id"])
        dms_file_id = str(dok.get("dms_file_id", dok_id))

        nodes: list[DocumentNode] = []
        chunk_groups = _group_chunks_by_node(chunks_by_doc.get(dok_id, []))

        for group in chunk_groups:
            # The position=0 chunk carries node metadata
            head = group[0]
            node_id = head.get("page_index_node_id") or str(head["id"])
            summary = head.get("page_index_summary") or head.get("header", "")

            text_parts: list[str] = []
            chunk_ids: list[str] = []
            page_numbers: set[int] = set()

            for chunk in group:
                chunk_id = str(chunk["id"])
                chunk_ids.append(chunk_id)
                for pn in chunk.get("page_numbers") or []:
                    page_numbers.add(pn)
                for sc in sub_chunks_by_chunk.get(chunk_id, []):
                    chunk_ids.append(str(sc["id"]))
                    md_id = str(sc.get("markdown_text_id", ""))
                    if md_id in md_by_id:
                        text_parts.append(md_by_id[md_id])

            try:
                node = DocumentNode(
                    node_id=node_id,
                    title=head.get("header", ""),
                    text="".join(text_parts),
                    summary=summary,
                    chunk_ids=chunk_ids,
                    page_numbers=sorted(page_numbers),
                )
                nodes.append(node)
            except ValidationError as e:
                logger.warning(
                    "Skipping invalid DocumentNode for chunk %s (dok=%s): %s",
                    node_id,
                    dok_id,
                    e,
                )
                continue

        documents.append(
            Document(
                file_id=dms_file_id,
                document_name=dok.get("filename", ""),
                nodes=nodes,
            )
        )

    return documents


def index_exam_data(
    all_chunks: list[dict[str, Any]],
    all_sub_chunks: list[dict[str, Any]],
    all_md_texts: list[dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]], dict[str, str]]:
    """Index resolved examination service data for fast lookup.

    Returns:
        (chunks_by_doc, sub_chunks_by_chunk, md_by_id)
    """
    md_by_id: dict[str, str] = {str(m["id"]): m.get("text", "") for m in all_md_texts}

    chunks_by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for c in all_chunks:
        doc_id = str(c.get("dokument_id", ""))
        if doc_id:
            chunks_by_doc[doc_id].append(c)
    for doc_chunks in chunks_by_doc.values():
        doc_chunks.sort(key=lambda x: x.get("order", 0))

    sub_chunks_by_chunk: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sc in all_sub_chunks:
        chunk_id = str(sc.get("chunk_id", ""))
        if chunk_id:
            sub_chunks_by_chunk[chunk_id].append(sc)
    for sub_chunks in sub_chunks_by_chunk.values():
        sub_chunks.sort(key=lambda x: x.get("order", 0))

    return chunks_by_doc, sub_chunks_by_chunk, md_by_id


# ---------------------------------------------------------------------------
# Norm data helpers
# ---------------------------------------------------------------------------


def derive_norm(data: NormData) -> str:
    """Build a human-readable norm string from the NormData payload."""
    return f"{data.gesetz} ({data.jurabk}) § {data.paragraph or data.paragraph_nr} {data.paragraph_titel}"


def collect_saetze(data: NormData) -> list[dict[str, Any]]:
    """Return metadata for every Satz that has tatbestandsmerkmale."""
    result: list[dict[str, Any]] = []
    satz_index = 0
    for absatz in data.absaetze:
        absatz_nr = str(absatz.absatz_nr)
        absatz_key = f"absatz_{absatz_nr}"
        for fallback_position, satz in enumerate(absatz.saetze):
            satz_nr = str(satz.satz_nr)
            position = satz.position if satz.position is not None else fallback_position
            if not satz.tatbestandsmerkmale:
                continue
            result.append(
                {
                    "absatz_nr": absatz_nr,
                    "satz_nr": satz_nr,
                    "position": position,
                    "absatz_key": absatz_key,
                    "satz_key": f"satz_{satz_nr}_{position}",
                    "satz_index": satz_index,
                    "tbm_text": ", ".join(satz.tatbestandsmerkmale),
                }
            )
            satz_index += 1
    return result
