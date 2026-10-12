"""Document-level ranking: chunk aggregation and Reciprocal Rank Fusion."""

from collections import defaultdict
from typing import Any

from src.config import CONFIG


def document_key(doc: dict[str, Any]) -> str | None:
    """Single document identity across all ranking stages: document_id → document_name → title."""
    return doc.get("document_id") or doc.get("document_name") or doc.get("title")


def _chunk_score(chunk: dict[str, Any]) -> float:
    """Every retrieval result carries a score; a missing or null one is a contract violation."""
    score = chunk.get("score")
    if score is None:
        raise ValueError(f"document {document_key(chunk)!r} reached ranking without a score")
    return float(score)


def _create_doc_entry(doc_key: str, chunk: dict[str, Any]) -> dict[str, Any]:
    """Build a fresh document accumulator dict from the first chunk seen for a document."""
    return {
        "document_id": chunk.get("document_id") or doc_key,
        "title": chunk.get("title") or chunk.get("document_name"),
        "project_id": chunk.get("project_id"),
        "score": _chunk_score(chunk),
        "page_numbers": set(),
        "parent_page_numbers": set(),
        "chunk_ids": [],
    }


def aggregate_to_documents(
    chunk_results: list[dict[str, Any]],
    *,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    """Documents are keyed by ``document_key``; chunks missing every identity field are silently skipped."""
    doc_map: dict[str, dict[str, Any]] = {}

    for chunk in chunk_results:
        doc_key = document_key(chunk)
        if not doc_key:
            continue

        if doc_key not in doc_map:
            doc_map[doc_key] = _create_doc_entry(doc_key, chunk)

        entry = doc_map[doc_key]

        entry["score"] = max(entry["score"], _chunk_score(chunk))

        for p in chunk.get("page_numbers") or []:
            if isinstance(p, int):
                entry["page_numbers"].add(p)

        for p in chunk.get("parent_page_numbers") or []:
            if isinstance(p, int):
                entry["parent_page_numbers"].add(p)

        chunk_id = chunk.get("chunk_id")
        if chunk_id and chunk_id not in entry["chunk_ids"]:
            entry["chunk_ids"].append(chunk_id)

    ranked = sorted(doc_map.values(), key=lambda d: d["score"], reverse=True)
    for doc in ranked:
        doc["page_numbers"] = sorted(doc["page_numbers"])
        doc["parent_page_numbers"] = sorted(doc["parent_page_numbers"])

    return ranked[:top_k] if top_k else ranked


def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    top_k: int | None = CONFIG.MATCHING.DEFAULT_TOP_K,
    k: int = CONFIG.MATCHING.RRF_K,
) -> list[dict[str, Any]]:
    """Merge ranked document lists using RRF; documents are keyed by ``document_key``, ``top_k=None`` returns all.

    The fused score is written to ``score`` -- the same field every other ranking stage reads.
    """
    rrf_scores: dict[str, float] = defaultdict(float)
    doc_data: dict[str, dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, doc in enumerate(ranked_list, start=1):
            doc_key = document_key(doc)
            if not doc_key:
                continue

            rrf_scores[doc_key] += 1.0 / (k + rank)
            if doc_key not in doc_data:
                doc_data[doc_key] = {
                    "title": doc.get("title") or doc.get("document_name"),
                    "document_id": doc.get("document_id") or doc_key,
                    "project_id": doc.get("project_id"),
                    "page_numbers": list(doc.get("page_numbers") or []),
                }

    fused: list[dict[str, Any]] = []
    for doc_key, score in rrf_scores.items():
        entry = dict(doc_data[doc_key])
        entry["score"] = score
        fused.append(entry)

    fused.sort(key=lambda d: d["score"], reverse=True)
    return fused if top_k is None else fused[:top_k]
