"""QdrantBuilderWorkflow — indexes processed document chunks into Qdrant."""

import asyncio
from datetime import timedelta

from pydantic import BaseModel
from temporal.activities.embedding import embedding_invoke
from temporal.activities.models import EmbeddingModel
from temporal.utils import sliding_window_collect_failures
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.activities.qdrant.client import init_qdrant_collection
from src.activities.qdrant.indexing import get_inhalts_extraktion_docs, prepare_qdrant_data, upload_to_qdrant
from src.activities.qdrant.schemas import (
    EmbeddedChunk,
    EmbeddedQuestion,
    EmbeddedSummary,
    QdrantDocumentInput,
    QdrantExtractionFile,
    QdrantUploadInput,
)
from src.config import snapshot_config
from src.env import ENV

build_qdrant_workflow_id = "build-qdrant-workflow"


class QdrantBuilderWorkflowInput(BaseModel):
    """Input parameters for QdrantBuilderWorkflow."""

    project_id: str
    documents: list[QdrantDocumentInput] | None = None
    source_file_ids: list[str] | None = None


class QdrantBuilderWorkflowOutput(BaseModel):
    """Output with per-document success/failure tracking."""

    processed_document_ids: list[str]
    failed_document_ids: list[str]


class QdrantSingleDocInput(BaseModel):
    """Input for the per-document child workflow."""

    doc_input: QdrantDocumentInput
    embedding_model: EmbeddingModel


@workflow.defn(name="qdrant-single-doc-workflow")
class QdrantSingleDocWorkflow:
    """Child workflow that prepares, embeds, and uploads a single document to Qdrant.

    Bounded history per document: ~15 events (prepare activity + 3 embedding
    activities + upload activity). The parent workflow's history stays small
    regardless of document count.
    """

    @workflow.run
    async def run(self, inp: QdrantSingleDocInput) -> str:
        """Prepare → Embed (parallel) → Upload for a single document."""
        # 1. Prepare (Activity)
        prepared = await prepare_qdrant_data(inp.doc_input)

        if prepared is None:
            return inp.doc_input.extraction_file_id

        # 2. Embed — 3 separate calls (one per type, parallel)
        chunk_texts = [c.page_content for c in prepared.chunks]
        question_texts = [q.question_text for q in prepared.questions]
        summary_texts = [s.summary_text for s in prepared.summaries]

        chunk_vecs, question_vecs, summary_vecs = await asyncio.gather(
            embedding_invoke(chunk_texts, model=inp.embedding_model),
            embedding_invoke(question_texts, model=inp.embedding_model),
            embedding_invoke(summary_texts, model=inp.embedding_model),
        )

        # 3. Build transport wrappers
        upload_input = QdrantUploadInput(
            embedded_chunks=[
                EmbeddedChunk(chunk=c, dense_vector=v) for c, v in zip(prepared.chunks, chunk_vecs, strict=True)
            ],
            embedded_questions=[
                EmbeddedQuestion(question=q, dense_vector=v)
                for q, v in zip(prepared.questions, question_vecs, strict=True)
            ],
            embedded_summaries=[
                EmbeddedSummary(summary=s, dense_vector=v)
                for s, v in zip(prepared.summaries, summary_vecs, strict=True)
            ],
            parent_chunks=prepared.parent_chunks,
            doc_context=prepared.doc_context,
            avg_chunk_length=prepared.avg_chunk_length,
            avg_question_length=prepared.avg_question_length,
        )

        # 4. Upload (Activity)
        return await upload_to_qdrant(upload_input)


@workflow.defn(name=build_qdrant_workflow_id)
class QdrantBuilderWorkflow:
    """Workflow that builds a Qdrant vector index for a project.

    Lists all _processed.json extraction results from DMS, initialises the
    Qdrant collection (idempotent), and processes documents via child workflows
    in sliding-window concurrency.
    """

    @workflow.run
    async def run(self, params: QdrantBuilderWorkflowInput) -> QdrantBuilderWorkflowOutput:
        """Index processed documents into Qdrant vector database in batches."""
        cfg = snapshot_config()

        workflow.logger.info(
            "Starting Qdrant build for project %s.",
            params.project_id,
        )

        # Resolve embedding model from ENV
        embedding_model: EmbeddingModel = ENV.EMBEDDING_MODEL

        # 1. Initialise collection (idempotent — preserves existing data)
        await init_qdrant_collection()

        # 2. Build document input list — use pre-loaded documents or fall back to DMS
        doc_inputs: list[QdrantDocumentInput]
        if params.documents is not None:
            doc_inputs = params.documents
            workflow.logger.info("Using %d pre-loaded documents (skipping DMS).", len(doc_inputs))
        else:
            extraction_files: list[QdrantExtractionFile] = await get_inhalts_extraktion_docs(
                params.project_id,
                params.source_file_ids,
            )
            if not extraction_files:
                raise ApplicationError(
                    f"No _processed.json files found in DMS for project {params.project_id}.",
                    type="QdrantNoDocumentsError",
                    non_retryable=True,
                )
            doc_inputs = [
                QdrantDocumentInput(
                    extraction_file_id=ef.extraction_file_id,
                    project_id=ef.project_id,
                )
                for ef in extraction_files
            ]
            workflow.logger.info("Found %d extraction files to index from DMS.", len(doc_inputs))

        # 3. Process with sliding window concurrency via child workflows
        async def _index_one(doc_input: QdrantDocumentInput) -> str:
            """Index a single document via child workflow."""
            return await workflow.execute_child_workflow(
                QdrantSingleDocWorkflow.run,
                arg=QdrantSingleDocInput(doc_input=doc_input, embedding_model=embedding_model),
                id=f"qdrant-single-doc-{doc_input.extraction_file_id}",
                task_queue=workflow.info().task_queue,
                execution_timeout=timedelta(minutes=30),
            )

        processed_document_ids, failed_inputs = await sliding_window_collect_failures(
            doc_inputs, _index_one, cfg.QDRANT_PARALLEL_DOCS_SIZE
        )
        failed_document_ids = [di.extraction_file_id for di in failed_inputs]

        if not processed_document_ids:
            raise ApplicationError(
                f"All {len(failed_document_ids)} document uploads to Qdrant failed. Check activity logs for details.",
                type="QdrantAllUploadsFailedError",
                non_retryable=True,
            )

        workflow.logger.info(
            "Qdrant build complete: %d succeeded, %d failed.",
            len(processed_document_ids),
            len(failed_document_ids),
        )

        return QdrantBuilderWorkflowOutput(
            processed_document_ids=processed_document_ids,
            failed_document_ids=failed_document_ids,
        )
