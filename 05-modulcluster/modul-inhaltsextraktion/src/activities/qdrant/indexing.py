"""Qdrant document indexing activities and upload helpers."""

import asyncio
import json
import uuid
from datetime import timedelta

from qdrant_client import AsyncQdrantClient
from qdrant_client import models as qm
from qdrant_client.http.models import PointStruct
from temporal.contracts import QdrantSourceFileCleanupInput, QdrantSourceFileCleanupOutput
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.qdrant.client import _get_qdrant_client
from src.activities.qdrant.preparation import (
    _extract_hypothetical_questions,
    _extract_parent_chunks,
    _flatten_chunks,
)
from src.activities.qdrant.schemas import (
    EmbeddedChunk,
    EmbeddedQuestion,
    EmbeddedSummary,
    QdrantDocumentInput,
    QdrantExtractionFile,
    QdrantPreparedData,
    QdrantUploadInput,
)
from src.config import get_config
from src.env import ENV
from src.schemas import ProcessedDocument
from src.utils.dms_utils import download_file, list_all_files
from src.workflows.deletion.types import QdrantDocumentDeleteInput
from src.workflows.qdrant.schemas import (
    ChunkMetadata,
    ParentChunkMetadata,
    QdrantDocumentContext,
    QuestionMetadata,
    SummaryMetadata,
)

__all__ = [
    "_delete_document_by_source_file_id",
    "_delete_document_version",
    "_get_highest_document_version",
    "_get_inhalts_extraktion_docs",
    "_mark_qdrant_source_files_deleted",
    "_prepare_qdrant_data",
    "_restore_qdrant_source_files_deleted",
    "_upload_chunks_to_qdrant",
    "_upload_parent_chunks_to_qdrant",
    "_upload_questions_to_qdrant",
    "_upload_summaries_to_qdrant",
    "_upload_to_qdrant",
    "get_inhalts_extraktion_docs",
]

_BM25_SPARSE_MODEL = "Qdrant/bm25"


def _build_document_filter(project_id: str, document_title: str) -> qm.Filter:
    """Build a Qdrant filter matching a project and exact document title."""
    return qm.Filter(
        must=[
            qm.FieldCondition(key="project_id", match=qm.MatchValue(value=project_id)),
            qm.FieldCondition(key="title", match=qm.MatchValue(value=document_title)),
        ]
    )


async def _get_highest_document_version(
    qdrant_client: AsyncQdrantClient,
    project_id: str,
    document_title: str,
) -> int | None:
    """Return the highest existing version for a document matched by exact title."""
    collection_name = ENV.QDRANT_COLLECTION_NAME
    scroll_filter = _build_document_filter(project_id, document_title)
    next_page_offset = None
    highest_version: int | None = None

    while True:
        points, next_page_offset = await qdrant_client.scroll(
            collection_name=collection_name,
            scroll_filter=scroll_filter,
            with_payload=["version"],
            with_vectors=False,
            limit=256,
            offset=next_page_offset,
        )

        for point in points:
            if point.payload is not None and (version := point.payload.get("version")) is not None:
                highest_version = version if highest_version is None else max(highest_version, version)

        if next_page_offset is None:
            break

    return highest_version


async def _delete_document_version(
    qdrant_client: AsyncQdrantClient,
    project_id: str,
    document_title: str,
    version: int,
) -> None:
    """Soft-delete all points for one exact document title and version."""
    collection_name = ENV.QDRANT_COLLECTION_NAME

    await qdrant_client.set_payload(
        collection_name=collection_name,
        payload={
            "is_deleted": True,
        },
        points=qm.Filter(
            must=[
                qm.FieldCondition(
                    key="project_id",
                    match=qm.MatchValue(value=project_id),
                ),
                qm.FieldCondition(
                    key="title",
                    match=qm.MatchValue(value=document_title),
                ),
                qm.FieldCondition(
                    key="version",
                    match=qm.MatchValue(value=version),
                ),
            ]
        ),
        wait=True,
    )


async def _deserialize_processed_document(raw_bytes: bytes) -> ProcessedDocument:
    """Deserialize JSON bytes into a ProcessedDocument off the event loop."""
    return await asyncio.to_thread(lambda: ProcessedDocument(**json.loads(raw_bytes)))


@activity.defn(name="get_inhalts_extraktion_docs")
async def _get_inhalts_extraktion_docs(input: tuple[str, list[str] | None]) -> list[QdrantExtractionFile]:
    """List matching _processed.json files for the requested source file IDs."""
    project_id, file_ids = input
    requested_file_ids = set(file_ids or [])

    if not requested_file_ids:
        activity.logger.info("No file_ids provided for project %s. Returning empty extraction file list.", project_id)
        return []

    all_files = await list_all_files(uuid.UUID(project_id), "content_extraction")
    candidate_files = [
        QdrantExtractionFile(
            extraction_file_id=str(f.id),
            filename=f.filename,
            project_id=project_id,
        )
        for f in all_files
        if f.filename.endswith("_processed.json")
    ]
    results: list[QdrantExtractionFile] = []

    for extraction_file in candidate_files:
        try:
            raw_bytes = await download_file(extraction_file.extraction_file_id)
            processed_doc = await _deserialize_processed_document(raw_bytes)
        except Exception:
            activity.logger.exception(
                "Failed to inspect processed extraction file %s (%s) while filtering by file_ids",
                extraction_file.extraction_file_id,
                extraction_file.filename,
            )
            continue

        if processed_doc.metadata.source_file_id in requested_file_ids:
            results.append(extraction_file)

    activity.logger.info(
        "Found %d matching _processed.json files out of %d candidates across %d total content_extraction files for project %s",
        len(results),
        len(candidate_files),
        len(all_files),
        project_id,
    )
    return results


async def _upload_chunks_to_qdrant(
    embedded_chunks: list[EmbeddedChunk],
    doc_context: QdrantDocumentContext,
    qdrant_client: AsyncQdrantClient,
    avg_document_length: float,
) -> None:
    """Upload a batch of chunks to Qdrant with dense + sparse vectors."""
    if not embedded_chunks:
        return

    collection_name = ENV.QDRANT_COLLECTION_NAME

    points: list[PointStruct] = []
    for ec in embedded_chunks:
        chunk_payload = ec.chunk.model_dump(exclude={"page_content"})
        payload = {
            "type": "chunk",
            "project_id": doc_context.project_id,
            "document_id": doc_context.document_id,
            "source_file_id": doc_context.source_file_id,
            "title": doc_context.title,
            "version": doc_context.version,
            "is_deleted": doc_context.is_deleted,
            "chunk_content": ec.chunk.page_content,
            **chunk_payload,
        }

        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "dense": ec.dense_vector,
                    "sparse": qm.Document(
                        text=ec.chunk.page_content,
                        model=_BM25_SPARSE_MODEL,
                        options={"avg_len": avg_document_length},
                    ),
                },
                payload=payload,
            )
        )

    await qdrant_client.upsert(collection_name=collection_name, points=points, wait=True)


async def _upload_questions_to_qdrant(
    embedded_questions: list[EmbeddedQuestion],
    doc_context: QdrantDocumentContext,
    qdrant_client: AsyncQdrantClient,
    avg_question_length: float,
) -> None:
    """Upload hypothetical questions to Qdrant with dense + sparse vectors."""
    if not embedded_questions:
        return

    collection_name = ENV.QDRANT_COLLECTION_NAME

    points: list[PointStruct] = []
    for eq in embedded_questions:
        payload = {
            "type": "question",
            "project_id": doc_context.project_id,
            "document_id": doc_context.document_id,
            "source_file_id": doc_context.source_file_id,
            "title": doc_context.title,
            "version": doc_context.version,
            "is_deleted": doc_context.is_deleted,
            "chunk_id": eq.question.chunk_id,
            "parent_chunk_id": eq.question.parent_chunk_id,
            "question_text": eq.question.question_text,
        }
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "dense": eq.dense_vector,
                    "sparse": qm.Document(
                        text=eq.question.question_text,
                        model=_BM25_SPARSE_MODEL,
                        options={"avg_len": avg_question_length},
                    ),
                },
                payload=payload,
            )
        )

    await qdrant_client.upsert(collection_name=collection_name, points=points, wait=True)


async def _upload_parent_chunks_to_qdrant(
    parent_chunks: list[ParentChunkMetadata],
    doc_context: QdrantDocumentContext,
    qdrant_client: AsyncQdrantClient,
) -> None:
    """Upload parent chunks to Qdrant as payload-only points (no vectors)."""
    if not parent_chunks:
        return

    collection_name = ENV.QDRANT_COLLECTION_NAME

    points: list[PointStruct] = []
    for pc in parent_chunks:
        payload = {
            "type": "parent_chunk",
            "project_id": doc_context.project_id,
            "document_id": doc_context.document_id,
            "source_file_id": doc_context.source_file_id,
            "title": doc_context.title,
            "version": doc_context.version,
            "is_deleted": doc_context.is_deleted,
            "chunk_id": pc.chunk_id,
            "page_content": pc.page_content,
            "page_numbers": pc.page_numbers,
        }
        points.append(PointStruct(id=str(uuid.uuid4()), vector={}, payload=payload))

    await qdrant_client.upsert(collection_name=collection_name, points=points, wait=True)


async def _upload_summaries_to_qdrant(
    embedded_summaries: list[EmbeddedSummary],
    doc_context: QdrantDocumentContext,
    qdrant_client: AsyncQdrantClient,
) -> None:
    """Upload document summaries to Qdrant with dense + sparse vectors."""
    if not embedded_summaries:
        return

    collection_name = ENV.QDRANT_COLLECTION_NAME
    texts = [es.summary.summary_text for es in embedded_summaries]
    avg_document_length = sum(len(t.split()) for t in texts) / len(texts)

    points: list[PointStruct] = []
    for es in embedded_summaries:
        payload = {
            "type": "summary",
            "project_id": doc_context.project_id,
            "document_id": doc_context.document_id,
            "source_file_id": doc_context.source_file_id,
            "title": doc_context.title,
            "version": doc_context.version,
            "is_deleted": doc_context.is_deleted,
            "summary_text": es.summary.summary_text,
        }
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "dense": es.dense_vector,
                    "sparse": qm.Document(
                        text=es.summary.summary_text,
                        model=_BM25_SPARSE_MODEL,
                        options={"avg_len": avg_document_length},
                    ),
                },
                payload=payload,
            )
        )

    await qdrant_client.upsert(collection_name=collection_name, points=points, wait=True)


@activity.defn(name="prepare_qdrant_data")
async def _prepare_qdrant_data(input: QdrantDocumentInput) -> QdrantPreparedData | None:
    """Download a processed document and prepare data for embedding + Qdrant upload.

    Returns ``None`` when the document contains no indexable chunks.
    Emits heartbeats after download and after deserialization.
    """
    # Use pre-loaded document if available, otherwise download from DMS
    if input.processed_document is not None:
        processed_doc = input.processed_document
    else:
        raw_bytes = await download_file(input.extraction_file_id)
        activity.heartbeat("Downloaded document")
        processed_doc = await _deserialize_processed_document(raw_bytes)
        activity.heartbeat("Deserialized document")

    document_id = input.extraction_file_id
    document_name = processed_doc.metadata.original_document_name

    activity.logger.info(
        "Preparing document %s (%s) — %d chunks",
        document_id,
        document_name,
        len(processed_doc.chunks),
    )

    def _prepare_sync() -> tuple[list[ChunkMetadata], list[QuestionMetadata], list[ParentChunkMetadata]]:
        """Flatten chunks, questions, and parent chunks from the processed document."""
        return (
            _flatten_chunks(processed_doc),
            _extract_hypothetical_questions(processed_doc),
            _extract_parent_chunks(processed_doc),
        )

    prepared_chunks, prepared_questions, prepared_parent_chunks = await asyncio.to_thread(_prepare_sync)
    prepared_summaries: list[SummaryMetadata] = (
        [SummaryMetadata(summary_text=processed_doc.metadata.summary)] if processed_doc.metadata.summary else []
    )

    if not prepared_chunks:
        activity.logger.info("No sub-chunks found for document %s — skipping.", document_id)
        return None

    # Compute avg lengths for BM25 params
    def _compute_avg_lengths() -> tuple[float, float]:
        """Compute average word counts for chunks and questions."""
        chunk_texts = [c.page_content for c in prepared_chunks]
        avg_chunk = sum(len(t.split()) for t in chunk_texts) / len(chunk_texts)
        if prepared_questions:
            q_texts = [q.question_text for q in prepared_questions]
            avg_q = sum(len(t.split()) for t in q_texts) / len(q_texts)
        else:
            avg_q = 0.0
        return avg_chunk, avg_q

    avg_chunk_length, avg_question_length = await asyncio.to_thread(_compute_avg_lengths)

    doc_context = QdrantDocumentContext(
        project_id=input.project_id,
        document_id=document_id,
        source_file_id=processed_doc.metadata.source_file_id,
        title=document_name,
        version=0,  # placeholder — set by upload activity
        is_deleted=False,
    )

    return QdrantPreparedData(
        chunks=prepared_chunks,
        questions=prepared_questions,
        summaries=prepared_summaries,
        parent_chunks=prepared_parent_chunks,
        doc_context=doc_context,
        avg_chunk_length=avg_chunk_length,
        avg_question_length=avg_question_length,
    )


@activity.defn(name="upload_to_qdrant")
async def _upload_to_qdrant(input: QdrantUploadInput) -> str:
    """Upload pre-embedded data to Qdrant with version management.

    Accepts pre-computed embedding vectors via transport wrappers and handles
    version lookup, soft-delete of old versions, and batched upserts.
    Emits heartbeats after each batch so Temporal can detect liveness.
    """
    cfg = get_config()
    batch_size = cfg.QDRANT_UPLOAD_BATCH_SIZE
    doc_context = input.doc_context
    document_name = doc_context.title

    qdrant_client = _get_qdrant_client()
    try:
        if doc_context.source_file_id:
            await qdrant_client.set_payload(
                collection_name=ENV.QDRANT_COLLECTION_NAME,
                payload={"is_deleted": True},
                points=_build_source_file_filter(doc_context.project_id, doc_context.source_file_id),
                wait=True,
            )

        highest_version = await _get_highest_document_version(
            qdrant_client=qdrant_client,
            project_id=doc_context.project_id,
            document_title=document_name or "",
        )

        if highest_version is None:
            version = 1
            activity.logger.info(
                "No existing Qdrant points found for exact title %s in project %s. Creating version 1.",
                document_name,
                doc_context.project_id,
            )
        else:
            version = highest_version + 1
            activity.logger.info(
                "Found existing Qdrant points for exact title %s in project %s. Deleting old version and creating new version %d.",
                document_name,
                doc_context.project_id,
                version,
            )
            await _delete_document_version(
                qdrant_client=qdrant_client,
                project_id=doc_context.project_id,
                document_title=document_name or "",
                version=highest_version,
            )

        # Update version on the context for all uploads
        versioned_context = doc_context.model_copy(update={"version": version})

        # 1. Upload chunks (batched with heartbeats)
        for i in range(0, len(input.embedded_chunks), batch_size):
            batch = input.embedded_chunks[i : i + batch_size]
            await _upload_chunks_to_qdrant(
                embedded_chunks=batch,
                doc_context=versioned_context,
                qdrant_client=qdrant_client,
                avg_document_length=input.avg_chunk_length,
            )
            activity.heartbeat(f"Uploaded chunk batch {i // batch_size + 1}")

        # 2. Upload questions (batched with heartbeats)
        if input.embedded_questions:
            for i in range(0, len(input.embedded_questions), batch_size):
                batch = input.embedded_questions[i : i + batch_size]
                await _upload_questions_to_qdrant(
                    embedded_questions=batch,
                    doc_context=versioned_context,
                    qdrant_client=qdrant_client,
                    avg_question_length=input.avg_question_length,
                )
                activity.heartbeat(f"Uploaded question batch {i // batch_size + 1}")

        # 3. Upload parent chunks (batched with heartbeats, no embeddings)
        if input.parent_chunks:
            for i in range(0, len(input.parent_chunks), batch_size):
                batch = input.parent_chunks[i : i + batch_size]
                await _upload_parent_chunks_to_qdrant(
                    parent_chunks=batch,
                    doc_context=versioned_context,
                    qdrant_client=qdrant_client,
                )
                activity.heartbeat(f"Uploaded parent chunk batch {i // batch_size + 1}")

        # 4. Upload summaries (typically a single point per document)
        if input.embedded_summaries:
            await _upload_summaries_to_qdrant(
                embedded_summaries=input.embedded_summaries,
                doc_context=versioned_context,
                qdrant_client=qdrant_client,
            )
            activity.heartbeat("Uploaded summaries")
    finally:
        await qdrant_client.close()

    activity.logger.info(
        "Uploaded %d chunks, %d questions, %d parent chunks, %d summaries for document %s to Qdrant.",
        len(input.embedded_chunks),
        len(input.embedded_questions),
        len(input.parent_chunks),
        len(input.embedded_summaries),
        doc_context.document_id,
    )
    return doc_context.document_id


def _build_source_file_filter(project_id: str, source_file_id: str) -> qm.Filter:
    """Build a Qdrant filter matching a project and source file ID."""
    return qm.Filter(
        must=[
            qm.FieldCondition(key="project_id", match=qm.MatchValue(value=project_id)),
            qm.FieldCondition(key="source_file_id", match=qm.MatchValue(value=source_file_id)),
        ]
    )


@activity.defn(name="delete_document_by_source_file_id")
async def _delete_document_by_source_file_id(input: QdrantDocumentDeleteInput) -> bool:
    """Soft-delete the highest existing version for one source file within a project."""
    qdrant_client = _get_qdrant_client()
    try:
        await qdrant_client.set_payload(
            collection_name=ENV.QDRANT_COLLECTION_NAME,
            payload={"is_deleted": True},
            points=_build_source_file_filter(str(input.project_id), input.document_file.file_id),
            wait=True,
        )
        activity.logger.info(
            "Soft-deleted Qdrant points for file %s (%s) in project %s.",
            input.document_file.filename,
            input.document_file.file_id,
            input.project_id,
        )
        return True
    except Exception:
        activity.logger.exception(
            "Failed to soft-delete Qdrant points for file %s (%s) in project %s.",
            input.document_file.filename,
            input.document_file.file_id,
            input.project_id,
        )
        return False
    finally:
        await qdrant_client.close()


def _build_active_source_file_filter(project_id: str, source_file_id: str) -> qm.Filter:
    return qm.Filter(
        must=[
            qm.FieldCondition(key="project_id", match=qm.MatchValue(value=project_id)),
            qm.FieldCondition(key="source_file_id", match=qm.MatchValue(value=source_file_id)),
            qm.FieldCondition(key="is_deleted", match=qm.MatchValue(value=False)),
        ]
    )


def _build_cleanup_marker_filter(project_id: str, source_file_id: str, marker: str) -> qm.Filter:
    return qm.Filter(
        must=[
            qm.FieldCondition(key="project_id", match=qm.MatchValue(value=project_id)),
            qm.FieldCondition(key="source_file_id", match=qm.MatchValue(value=source_file_id)),
            qm.FieldCondition(key="qdrant_cleanup_marker", match=qm.MatchValue(value=marker)),
        ]
    )


@activity.defn(name="mark_qdrant_source_files_deleted")
async def _mark_qdrant_source_files_deleted(input: QdrantSourceFileCleanupInput) -> QdrantSourceFileCleanupOutput:
    qdrant_client = _get_qdrant_client()
    try:
        if await qdrant_client.collection_exists(ENV.QDRANT_COLLECTION_NAME):
            for source_file_id in input.source_file_ids:
                await qdrant_client.set_payload(
                    collection_name=ENV.QDRANT_COLLECTION_NAME,
                    payload={
                        "is_deleted": True,
                        "qdrant_cleanup_marker": input.marker,
                        "qdrant_cleanup_project_version": input.project_version,
                    },
                    points=_build_active_source_file_filter(input.project_id, source_file_id),
                    wait=True,
                )
        return QdrantSourceFileCleanupOutput(processed_file_ids=input.source_file_ids)
    finally:
        await qdrant_client.close()


@activity.defn(name="restore_qdrant_source_files_deleted")
async def _restore_qdrant_source_files_deleted(input: QdrantSourceFileCleanupInput) -> QdrantSourceFileCleanupOutput:
    qdrant_client = _get_qdrant_client()
    try:
        if await qdrant_client.collection_exists(ENV.QDRANT_COLLECTION_NAME):
            for source_file_id in input.source_file_ids:
                await qdrant_client.set_payload(
                    collection_name=ENV.QDRANT_COLLECTION_NAME,
                    payload={
                        "is_deleted": False,
                        "qdrant_cleanup_marker": "",
                        "qdrant_cleanup_project_version": 0,
                    },
                    points=_build_cleanup_marker_filter(input.project_id, source_file_id, input.marker),
                    wait=True,
                )
        return QdrantSourceFileCleanupOutput(processed_file_ids=input.source_file_ids)
    finally:
        await qdrant_client.close()


# ---------------------------------------------------------------------------
# Workflow wrapper functions
# ---------------------------------------------------------------------------


async def get_inhalts_extraktion_docs(
    project_id: str,
    source_file_ids: list[str] | None = None,
) -> list[QdrantExtractionFile]:
    """Workflow wrapper: fetch DMS extraction file list."""
    return await workflow.execute_activity(
        _get_inhalts_extraktion_docs,
        (project_id, source_file_ids),
        start_to_close_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_QDRANT_ACTIVITY_MAX_ATTEMPTS,
            non_retryable_error_types=["ValueError"],
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=60),
        ),
    )


async def prepare_qdrant_data(input: QdrantDocumentInput) -> QdrantPreparedData | None:
    """Workflow wrapper: prepare document data for embedding + Qdrant upload."""
    return await workflow.execute_activity(
        _prepare_qdrant_data,
        input,
        start_to_close_timeout=timedelta(minutes=10),
        heartbeat_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_QDRANT_ACTIVITY_MAX_ATTEMPTS,
            non_retryable_error_types=["ValueError", "RuntimeError"],
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=60),
        ),
    )


async def upload_to_qdrant(input: QdrantUploadInput) -> str:
    """Workflow wrapper: upload pre-embedded data to Qdrant."""
    return await workflow.execute_activity(
        _upload_to_qdrant,
        input,
        start_to_close_timeout=timedelta(minutes=30),
        heartbeat_timeout=timedelta(minutes=5),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_QDRANT_ACTIVITY_MAX_ATTEMPTS,
            non_retryable_error_types=["ValueError", "RuntimeError"],
            initial_interval=timedelta(seconds=10),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=60),
        ),
    )
