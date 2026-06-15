"""Reverse mapping: examination service graph nodes → ProcessedDocument.

Inverse of mapper.py. Used by ensure_qdrant to reconstruct extraction data
from the examination service when the caller doesn't have inline data.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

from temporal.workflows.inhaltsextraktion.types import (
    Chunk,
    DocumentTypeInfo,
    Metadata,
    ProcessedDocument,
    ProcessedFileInfo,
    SubChunk,
)

_TYPED_SUB_CHUNK_TYPES = frozenset({"sub_chunk_text", "sub_chunk_table", "sub_chunk_image"})

_TYPED_NODE_FIELDS = ("asset_path", "caption", "summary", "description", "content", "footnote")


def _group_nodes(all_nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group nodes by node_type."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in all_nodes:
        node_type = node.get("node_type", "")
        if node_type in _TYPED_SUB_CHUNK_TYPES:
            groups["typed_sub_chunk"].append(node)
        else:
            groups[node_type].append(node)
    return groups


def _build_related_metadata(
    sc_id: str,
    relations_for_sc: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reconstruct related_assets / related_text metadata from relations."""
    related_assets: list[dict[str, Any]] = []
    related_text: list[dict[str, Any]] = []
    for rel in relations_for_sc:
        other_id = rel["to_sub_chunk_id"] if rel["from_sub_chunk_id"] == sc_id else rel["from_sub_chunk_id"]
        rel_type = rel.get("relation_type", "text")
        entry = {"chunk_id": other_id, "type": rel_type}
        if rel_type in ("table", "image"):
            related_assets.append(entry)
        else:
            related_text.append(entry)
    related_meta: dict[str, Any] = {}
    if related_assets:
        related_meta["related_assets"] = related_assets
    if related_text:
        related_meta["related_text"] = related_text
    return related_meta


def _build_sub_chunk_metadata(
    sc_node: dict[str, Any],
    typed_node: dict[str, Any] | None,
    relations_for_sc: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the metadata dict for a SubChunk from graph node payloads."""
    meta: dict[str, Any] = {}

    # Core fields
    meta["chunk_type"] = sc_node.get("chunk_type", "text")
    meta["page_numbers"] = sc_node.get("page_numbers", [])
    meta["focus_topic"] = sc_node.get("focus_topic") or ""
    meta["hypothetical_questions"] = sc_node.get("hypothetical_questions", [])

    # Header trail — stored as header_1/2/3, restored as "Header 1/2/3" for Qdrant
    for db_key, meta_key in (("header_1", "Header 1"), ("header_2", "Header 2"), ("header_3", "Header 3")):
        val = sc_node.get(db_key)
        if val is not None:
            meta[meta_key] = val

    # Species/scale enrichment
    if sc_node.get("wildlife_mentioned") is not None:
        meta["wildlife_mentioned"] = sc_node["wildlife_mentioned"]
    if sc_node.get("plant_species_mentioned") is not None:
        meta["plant_species_mentioned"] = sc_node["plant_species_mentioned"]
    meta["wildlife_species"] = sc_node.get("wildlife_species", [])
    meta["plant_species"] = sc_node.get("plant_species", [])
    if sc_node.get("map_scale") is not None:
        meta["map_scale"] = sc_node["map_scale"]

    # Typed node fields (table/image metadata)
    if typed_node:
        for field in _TYPED_NODE_FIELDS:
            val = typed_node.get(field)
            if val:
                meta[field] = val

    # Reconstruct related_assets / related_text from relations
    sc_id = sc_node.get("id", "")
    meta.update(_build_related_metadata(sc_id, relations_for_sc))

    return meta


def reconstruct_processed_files(
    all_nodes: list[dict[str, Any]],
    project_id: str,
) -> list[ProcessedFileInfo]:
    """Reconstruct ProcessedFileInfo list from examination service graph nodes.

    This is the inverse of map_processed_document_nodes in mapper.py.
    """
    groups = _group_nodes(all_nodes)

    # Build lookup tables
    markdown_texts: dict[str, str] = {node["id"]: node.get("text", "") for node in groups.get("markdown_text", [])}

    # typed sub_chunk nodes keyed by sub_chunk_id
    typed_by_sc_id: dict[str, dict[str, Any]] = {
        node["sub_chunk_id"]: node for node in groups.get("typed_sub_chunk", []) if "sub_chunk_id" in node
    }

    # Relations indexed by both endpoints
    relations_by_sc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for rel in groups.get("sub_chunk_relation", []):
        relations_by_sc[rel.get("from_sub_chunk_id", "")].append(rel)
        relations_by_sc[rel.get("to_sub_chunk_id", "")].append(rel)

    # Sub-chunks grouped by parent chunk_id
    sc_by_chunk: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sc_node in groups.get("sub_chunk", []):
        parent_chunk_id = sc_node.get("chunk_id", "")
        sc_by_chunk[parent_chunk_id].append(sc_node)

    # Chunks grouped by dokument_id
    chunks_by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for chunk_node in groups.get("chunk", []):
        doc_id = chunk_node.get("dokument_id", "")
        chunks_by_doc[doc_id].append(chunk_node)

    # Build one ProcessedFileInfo per dokument
    results: list[ProcessedFileInfo] = []

    for dok in groups.get("dokument", []):
        dok_id: str = dok["id"]

        # Document metadata
        document_type = None
        if dok.get("document_type"):
            document_type = DocumentTypeInfo(name=dok["document_type"])

        metadata = Metadata(
            document_id=dok.get("document_id", dok_id),
            original_document_name=dok.get("filename", "unknown"),
            source_file_id=dok.get("dms_file_id"),
            document_type=document_type,
            pages=dok.get("page_count"),
            summary=dok.get("summary", ""),
            project_id=project_id,
        )

        # Document markdown
        markdown_content = markdown_texts.get(dok.get("markdown_text_id", ""), "")

        # Reconstruct chunks
        chunk_nodes = sorted(chunks_by_doc.get(dok_id, []), key=lambda c: c.get("order", 0))
        chunks: list[Chunk] = []

        for chunk_node in chunk_nodes:
            chunk_id = chunk_node["id"]

            # Reconstruct sub_chunks for this chunk
            sc_nodes = sorted(sc_by_chunk.get(chunk_id, []), key=lambda s: s.get("order", 0))
            sub_chunks: list[SubChunk] = []

            for sc_node in sc_nodes:
                sc_id = sc_node["id"]
                sc_page_content = markdown_texts.get(sc_node.get("markdown_text_id", ""), "")
                sc_metadata = _build_sub_chunk_metadata(
                    sc_node,
                    typed_by_sc_id.get(sc_id),
                    relations_by_sc.get(sc_id, []),
                )

                sub_chunks.append(
                    SubChunk(
                        chunk_id=UUID(sc_id),
                        parent_chunk_id=UUID(chunk_id),
                        page_content=sc_page_content,
                        metadata=sc_metadata,
                        header=sc_node.get("header") or None,
                    )
                )

            # Chunk metadata
            chunk_metadata: dict[str, Any] = {
                "page_numbers": chunk_node.get("page_numbers", []),
                "toc_path": chunk_node.get("toc_path", []),
                "all_subchapters": chunk_node.get("all_subchapters", []),
                "hypothetical_questions": chunk_node.get("hypothetical_questions", []),
            }

            chunks.append(
                Chunk(
                    chunk_id=UUID(chunk_id),
                    page_content=chunk_node.get("page_content", ""),
                    metadata=chunk_metadata,
                    sub_chunks=sub_chunks,
                    header=chunk_node.get("header") or None,
                )
            )

        processed_doc = ProcessedDocument(
            metadata=metadata,
            markdown_content=markdown_content,
            chunks=chunks,
        )

        results.append(
            ProcessedFileInfo(
                document_name=dok.get("filename", "unknown"),
                document_path="",
                processed_json_file_id=dok.get("dms_file_id") or dok_id,
                source_file_id=UUID(dok["dms_file_id"]) if dok.get("dms_file_id") else None,
                processed_document=processed_doc,
            )
        )

    return results
