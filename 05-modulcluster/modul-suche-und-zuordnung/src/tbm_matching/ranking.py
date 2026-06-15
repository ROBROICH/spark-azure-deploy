"""Document-level ranking: chunk aggregation and Reciprocal Rank Fusion."""

from collections import defaultdict
from typing import Any

from src.config import CONFIG


def _create_doc_entry(doc_key: str, chunk: dict[str, Any]) -> dict[str, Any]:
    """Build a fresh document accumulator dict from the first chunk seen for a document."""
    return {
        "document_id": chunk.get("document_id") or doc_key,
        "title": chunk.get("title") or chunk.get("document_name"),
        "project_id": chunk.get("project_id"),
        "score": chunk.get("score", 0.0) or 0.0,
        "page_numbers": set(),
        "parent_page_numbers": set(),
        "chunk_ids": [],
    }


def aggregate_to_documents(
    chunk_results: list[dict[str, Any]],
    *,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    """Document identity falls back: document_id → document_name → title; chunks missing all three are silently skipped."""
    doc_map: dict[str, dict[str, Any]] = {}

    for chunk in chunk_results:
        doc_key = chunk.get("document_id") or chunk.get("document_name") or chunk.get("title")
        if not doc_key:
            continue

        if doc_key not in doc_map:
            doc_map[doc_key] = _create_doc_entry(doc_key, chunk)

        entry = doc_map[doc_key]

        score = chunk.get("score", 0.0) or 0.0
        entry["score"] = max(entry["score"], score)

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
    top_k: int = CONFIG.MATCHING.DEFAULT_TOP_K,
    k: int = CONFIG.MATCHING.RRF_K,
) -> list[dict[str, Any]]:
    """Merge multiple ranked document lists into one using RRF; documents are keyed by title."""
    rrf_scores: dict[str, float] = defaultdict(float)
    doc_data: dict[str, dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, doc in enumerate(ranked_list, start=1):
            title = doc.get("title") or "unknown"
            rrf_scores[title] += 1.0 / (k + rank)
            if title not in doc_data:
                doc_data[title] = {
                    "title": title,
                    "document_id": doc.get("document_id"),
                    "project_id": doc.get("project_id"),
                    "page_numbers": list(doc.get("page_numbers") or []),
                }

    fused: list[dict[str, Any]] = []
    for title, score in rrf_scores.items():
        entry = dict(doc_data[title])
        entry["rrf_score"] = score
        fused.append(entry)

    fused.sort(key=lambda d: d["rrf_score"], reverse=True)
    return fused[:top_k]
