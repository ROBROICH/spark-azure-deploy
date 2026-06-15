"""Retrieval module for TBM matching.

Handles Qdrant vector search (dense + sparse hybrid), document filtering,
and the top-level matching orchestration that ties retrieval, fusion,
query building, and rule-based lookup together.
"""

import logging
from collections.abc import Mapping
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models

from src.config import CONFIG
from src.config.env import ENV

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_qdrant = QdrantClient(ENV.QDRANT.HOST, port=ENV.QDRANT.PORT, timeout=300)
_collection_vector_cache: dict[str, set[str]] = {}

HEADER1_BLOCKLIST = {
    "inhaltsverzeichnis",
    "abbildungsverzeichnis",
    "tabellenverzeichnis",
    "abkürzungsverzeichnis",
    "literaturverzeichnis",
    "literatur",
}

qdrant_batch_size = 16
collection_name = ENV.QDRANT.COLLECTION

# ---------------------------------------------------------------------------
# Low-level retrieval helpers
# ---------------------------------------------------------------------------


def _collection_has_sparse(coll_name: str) -> bool:
    """Cached check; collection info is fetched from Qdrant only once per process lifetime."""
    if coll_name not in _collection_vector_cache:
        info = _qdrant.get_collection(coll_name)
        raw = info.config.params.vectors
        if isinstance(raw, Mapping):
            _collection_vector_cache[coll_name] = set(raw.keys())
        else:
            _collection_vector_cache[coll_name] = {"dense"}
    return "sparse" in _collection_vector_cache[coll_name]


def _create_project_filter(
    project_id: str,
    type_value: str,
) -> models.Filter:
    """Builds a Qdrant filter that restricts results to a specific project, type, and non-deleted documents."""
    return models.Filter(
        must=[
            models.FieldCondition(
                key="project_id",
                match=models.MatchValue(value=project_id),
            ),
            models.FieldCondition(
                key="type",
                match=models.MatchValue(value=type_value),
            ),
            models.FieldCondition(
                key="is_deleted",
                match=models.MatchValue(value=False),
            ),
        ]
    )


def _build_query_request(
    query_text: str,
    embedding: list[float],
    threshold: float,
    limit: int,
    project_id: str,
    type_value: str,
) -> models.QueryRequest:
    """Returns a hybrid dense+BM25 RRF request when the collection has a 'sparse' vector, dense-only otherwise."""
    project_filter = _create_project_filter(project_id=project_id, type_value=type_value)

    if _collection_has_sparse(collection_name):
        return models.QueryRequest(
            prefetch=[
                models.Prefetch(query=embedding, using="dense", limit=limit),
                models.Prefetch(
                    query=models.Document(text=query_text, model="Qdrant/bm25"),
                    using="sparse",
                    limit=limit,
                ),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            score_threshold=threshold,
            with_payload=True,
            limit=limit,
            filter=project_filter,
        )

    return models.QueryRequest(
        query=embedding,
        using="dense",
        score_threshold=threshold,
        with_payload=True,
        filter=project_filter,
        limit=limit,
    )


def filter_documents(normalized_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Removes documents whose 'Header 1' matches HEADER1_BLOCKLIST (e.g. table-of-contents pages)."""
    return [
        doc
        for doc in normalized_docs
        if not any(word in (doc.get("Header 1", "").lower()) for word in HEADER1_BLOCKLIST)
    ]


# ---------------------------------------------------------------------------
# Batch retrieval
# ---------------------------------------------------------------------------


def _merge_response_set(
    response_set: list[models.ScoredPoint],
    merge_key: str,
    include_chunk_id: bool,
    filter_blocklist: bool,
) -> list[dict[str, Any]]:
    """Deduplicates scored points by merge_key, keeping only the highest-scoring entry per key."""
    merged: dict[str, dict[str, Any]] = {}
    for r in response_set:
        payload = r.payload or {}
        chunk_id = payload.get("chunk_id")
        document_id = payload.get("source_file_id") or payload.get("document_id")

        if merge_key == "chunk_id":
            key = chunk_id
        elif merge_key == "document_id":
            key = document_id
        else:  # "chunk_id_or_document_id"
            key = chunk_id or document_id

        if not key:
            logger.info(
                "Skipping result with missing key (chunk_id=%s, document_id=%s)",
                chunk_id,
                document_id,
            )
            continue
        if key in merged and r.score <= merged[key]["score"]:
            continue

        metadata = payload.get("metadata") or {}
        entry = {
            "document_id": document_id,
            "project_id": payload.get("project_id"),
            "title": metadata.get("title") or payload.get("title"),
            "score": r.score,
        }
        if include_chunk_id:
            entry["chunk_id"] = chunk_id
        merged[key] = entry

    docs = list(merged.values())
    if filter_blocklist:
        docs = filter_documents(docs)
    return sorted(docs, key=lambda x: x["score"], reverse=True)


async def _batch_retrieval(
    queries: list[str],
    embeddings: list[list[float]],
    project_id: str,
    threshold: float,
    type_value: str,
    merge_key: str,
    include_chunk_id: bool = False,
    filter_blocklist: bool = False,
) -> list[list[dict[str, Any]]]:
    """Sends queries to Qdrant in batches of ``qdrant_batch_size`` and de-duplicates results by ``merge_key``."""
    if not queries:
        return []

    all_requests = [
        _build_query_request(
            query_text,
            emb,
            threshold,
            limit=CONFIG.MATCHING.LIMIT,
            project_id=project_id,
            type_value=type_value,
        )
        for query_text, emb in zip(queries, embeddings, strict=True)
    ]

    all_responses = []
    for i in range(0, len(all_requests), qdrant_batch_size):
        batch_requests = all_requests[i : i + qdrant_batch_size]
        batch_responses = _qdrant.query_batch_points(
            collection_name=collection_name,
            requests=batch_requests,
        )
        all_responses.extend([r.points for r in batch_responses])

    return [_merge_response_set(points, merge_key, include_chunk_id, filter_blocklist) for points in all_responses]


async def batch_simple_retrieval(
    queries: list[str],
    embeddings: list[list[float]],
    project_id: str,
    threshold: float,
) -> list[list[dict[str, Any]]]:
    """Retrieves chunks (type='chunk'), merges by chunk_id, and applies the HEADER1_BLOCKLIST filter."""
    return await _batch_retrieval(
        queries,
        embeddings,
        project_id,
        threshold,
        type_value="chunk",
        merge_key="chunk_id",
        include_chunk_id=True,
        filter_blocklist=True,
    )


async def batch_summary_retrieval(
    queries: list[str],
    embeddings: list[list[float]],
    project_id: str,
    threshold: float,
) -> list[list[dict[str, Any]]]:
    """Retrieves summaries (type='summary'), merges by document_id."""
    return await _batch_retrieval(
        queries,
        embeddings,
        project_id,
        threshold,
        type_value="summary",
        merge_key="document_id",
    )


async def batch_hypothetical_question_retrieval(
    queries: list[str],
    embeddings: list[list[float]],
    project_id: str,
    threshold: float,
) -> list[list[dict[str, Any]]]:
    """Filters by type='question', merges by chunk_id falling back to document_id."""
    return await _batch_retrieval(
        queries,
        embeddings,
        project_id,
        threshold,
        type_value="question",
        merge_key="chunk_id_or_document_id",
        include_chunk_id=True,
    )
