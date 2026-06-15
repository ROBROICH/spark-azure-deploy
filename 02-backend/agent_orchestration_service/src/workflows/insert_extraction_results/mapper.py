"""Pure mapping functions from ProcessedDocument to examination service insert payloads.

Must be called from workflow context — uses ``workflow.uuid4()`` for stable IDs.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from temporal.workflows.inhaltsextraktion.types import (
    Chunk,
    SubChunk,
)
from temporalio import workflow

from src.workflows.insert_extraction_results.types import InsertDocumentExtractionInput


def _insert(node_type: str, node_id: str | UUID, payload: dict[str, Any]) -> dict[str, Any]:
    return {"node_type": node_type, "id": str(node_id), "payload": payload}


def _sub_chunk_type_label(chunk_type: str | None) -> str:
    mapping = {
        "text": "sub_chunk_text",
        "table": "sub_chunk_table",
        "image": "sub_chunk_image",
    }
    return mapping.get(chunk_type or "", "sub_chunk_text")


def _build_typed_sub_chunk_payload(
    sub_chunk: SubChunk,
    sub_chunk_id: UUID,
    chunk_type: str | None,
) -> dict[str, Any]:
    meta = sub_chunk.metadata
    payload: dict[str, Any] = {
        "sub_chunk_id": str(sub_chunk_id),
    }

    if chunk_type in ("table", "image"):
        for key in ("asset_path", "caption", "summary", "description", "content", "footnote"):
            payload[key] = meta.get(key, "")

    return _insert(_sub_chunk_type_label(chunk_type), str(workflow.uuid4()), payload)


def _collect_relations(
    all_sub_chunks: list[SubChunk],
) -> list[dict[str, Any]]:
    """Collect one relation row per unique pair of sub-chunks."""
    seen_pairs: set[frozenset[str]] = set()
    relation_rows: list[dict[str, Any]] = []

    for sub_chunk in all_sub_chunks:
        source_id = str(sub_chunk.chunk_id)
        meta = sub_chunk.metadata

        for link_list_key in ("related_assets", "related_text"):
            for link in meta.get(link_list_key, []):
                target_id = str(link["chunk_id"])
                pair = frozenset((source_id, target_id))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)

                relation_rows.append(
                    _insert(
                        "sub_chunk_relation",
                        str(workflow.uuid4()),
                        {
                            "from_sub_chunk_id": source_id,
                            "to_sub_chunk_id": target_id,
                            "relation_type": link.get("type", "text"),
                        },
                    )
                )

    return relation_rows


def _build_page_index_payloads(chunks: list[Chunk]) -> list[dict[str, str | int | None]]:
    """Resolve page-index inheritance for chunk inserts."""
    page_index_payloads: list[dict[str, str | int | None]] = []
    current_node_id: str | None = None
    current_position: int | None = None

    for chunk in chunks:
        page_index_node = chunk.page_index_node

        if page_index_node is not None:
            current_node_id = page_index_node.node_id
            current_position = 0
            page_index_payloads.append(
                {
                    "page_index_node_id": current_node_id,
                    "page_index_position": current_position,
                    "page_index_summary": page_index_node.summary,
                }
            )
            continue

        if current_node_id is None:
            page_index_payloads.append(
                {
                    "page_index_node_id": None,
                    "page_index_position": None,
                    "page_index_summary": None,
                }
            )
            continue

        current_position = 0 if current_position is None else current_position + 1
        page_index_payloads.append(
            {
                "page_index_node_id": current_node_id,
                "page_index_position": current_position,
                "page_index_summary": None,
            }
        )

    return page_index_payloads


def map_processed_document_nodes(
    args: InsertDocumentExtractionInput,
    dokument_id_override: UUID | None = None,
) -> list[dict[str, Any]]:
    """Map a single ProcessedFileInfo to a list of examination service insert actions."""
    doc = args.processed_file_info.processed_document
    if doc is None:
        return []

    inserts: list[dict[str, Any]] = []
    metadata = doc.metadata
    topic_parent_ids: list[str] = [f"topic:{metadata.document_topic.id}"] if metadata.document_topic else []

    doc_markdown_text_id = str(workflow.uuid4())
    inserts.append(
        _insert(
            "markdown_text",
            doc_markdown_text_id,
            {"text": doc.markdown_content},
        )
    )

    dokument_id = str(dokument_id_override or workflow.uuid4())
    inserts.append(
        _insert(
            "dokument",
            dokument_id,
            {
                "filename": metadata.original_document_name,
                "mime_type": "application/pdf",
                "page_count": metadata.pages or 0,
                "dms_file_id": metadata.source_file_id,
                "document_id": metadata.document_id,
                "document_type": (metadata.document_type.name if metadata.document_type else None),
                "frontend_parent_ids": topic_parent_ids,
                "summary": metadata.summary,
                "markdown_text_id": doc_markdown_text_id,
            },
        )
    )

    chunks: list[Chunk] = doc.chunks
    page_index_payloads = _build_page_index_payloads(chunks)
    for idx, chunk in enumerate(chunks):
        prev_id = str(chunks[idx - 1].chunk_id) if idx > 0 else None
        next_id = str(chunks[idx + 1].chunk_id) if idx < len(chunks) - 1 else None
        c_meta = chunk.metadata
        page_index_payload = page_index_payloads[idx]

        inserts.append(
            _insert(
                "chunk",
                chunk.chunk_id,
                {
                    "dokument_id": dokument_id,
                    "order": idx,
                    "previous_chunk_id": prev_id,
                    "next_chunk_id": next_id,
                    "header": chunk.header or "",
                    "page_content": chunk.page_content,
                    "page_numbers": c_meta.get("page_numbers", []),
                    "toc_path": c_meta.get("toc_path", []),
                    "all_subchapters": c_meta.get("all_subchapters", []),
                    "hypothetical_questions": c_meta.get("hypothetical_questions", []),
                    **page_index_payload,
                },
            )
        )

    all_sub_chunks: list[SubChunk] = []
    for chunk in chunks:
        all_sub_chunks.extend(chunk.sub_chunks)

    for global_idx, sc in enumerate(all_sub_chunks):
        prev_sc_id = str(all_sub_chunks[global_idx - 1].chunk_id) if global_idx > 0 else None
        next_sc_id = str(all_sub_chunks[global_idx + 1].chunk_id) if global_idx < len(all_sub_chunks) - 1 else None
        sc_meta = sc.metadata
        chunk_type = sc_meta.get("chunk_type")

        sc_markdown_text_id = str(workflow.uuid4())
        inserts.append(
            _insert(
                "markdown_text",
                sc_markdown_text_id,
                {"text": sc.page_content},
            )
        )

        inserts.append(
            _insert(
                "sub_chunk",
                sc.chunk_id,
                {
                    "chunk_id": str(sc.parent_chunk_id),
                    "order": global_idx,
                    "previous_sub_chunk_id": prev_sc_id,
                    "next_sub_chunk_id": next_sc_id,
                    "header": sc.header or "",
                    "chunk_type": chunk_type or "text",
                    "focus_topic": sc_meta.get("focus_topic") or "",
                    "hypothetical_questions": sc_meta.get("hypothetical_questions", []),
                    "markdown_text_id": sc_markdown_text_id,
                    # Fields needed for Qdrant re-indexing via ensure_qdrant
                    "page_numbers": sc_meta.get("page_numbers", []),
                    "header_1": sc_meta.get("Header 1"),
                    "header_2": sc_meta.get("Header 2"),
                    "header_3": sc_meta.get("Header 3"),
                    "wildlife_mentioned": sc_meta.get("wildlife_mentioned"),
                    "plant_species_mentioned": sc_meta.get("plant_species_mentioned"),
                    "wildlife_species": sc_meta.get("wildlife_species", []),
                    "plant_species": sc_meta.get("plant_species", []),
                    "map_scale": sc_meta.get("map_scale"),
                },
            )
        )

        inserts.append(_build_typed_sub_chunk_payload(sc, sc.chunk_id, chunk_type))

    known_sub_chunk_ids = {str(sc.chunk_id) for sc in all_sub_chunks}
    relations = _collect_relations(all_sub_chunks)
    inserts.extend(
        r
        for r in relations
        if r["payload"]["from_sub_chunk_id"] in known_sub_chunk_ids
        and r["payload"]["to_sub_chunk_id"] in known_sub_chunk_ids
    )

    return inserts
