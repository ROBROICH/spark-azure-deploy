"""Temporal workflows for claim extraction and Qdrant upload."""

from datetime import timedelta

from temporal.activities.embedding import embedding_invoke
from temporal.activities.models import EmbeddingModel
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.dms_activities import (
    fetch_erlauterungsbericht_document_ids,
)
from src.activities.qdrant_activities import (
    delete_document_from_qdrant,
    fetch_and_prepare_chunks,
    init_qdrant_collection,
    upload_claims_to_qdrant,
)
from src.config.config import config
from src.config.env import ENV
from src.qdrant.schemas import ChunkPayload, ClaimPayload
from src.workflows.input_schemas import (
    OrchestratorInputSchema,
    SingleDocumentWorkflowInputSchema,
)
from src.workflows.qdrant_wf.extraction_batch_workflow import ClaimExtractionBatchWorkflow
from src.workflows.qdrant_wf.schemas.workflow import (
    DocumentActivityInput,
    ExtractionBatchInput,
    ExtractionBatchOutput,
    UploadClaimsInput,
)


@workflow.defn
class ClaimExtractionSingleDocumentWorkflow:
    """Child workflow that processes a single document: fetch chunks, extract claims, upload."""

    @workflow.run
    async def run(self, inp: SingleDocumentWorkflowInputSchema) -> None:
        # Phase 1: Delete existing document claims from Qdrant
        await workflow.execute_activity(
            delete_document_from_qdrant,
            arg=DocumentActivityInput(project_id=inp.project_id, document_id=inp.document_id),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(
                maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
                initial_interval=timedelta(seconds=10),
                backoff_coefficient=2,
                maximum_interval=timedelta(seconds=30),
            ),
        )

        # Phase 2: Fetch all chunks for this document
        chunk_payloads = await workflow.execute_activity(
            fetch_and_prepare_chunks,
            arg=DocumentActivityInput(project_id=inp.project_id, document_id=inp.document_id),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(
                maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
                initial_interval=timedelta(seconds=10),
                backoff_coefficient=2,
                maximum_interval=timedelta(seconds=30),
            ),
        )

        text_chunks = [c for c in chunk_payloads if c.chunk_type == "text"]
        # Table extraction is disabled. To re-enable, filter chunk_payloads by
        # chunk_type == "table" and assign the result here.
        table_chunks: list[ChunkPayload] = []
        batch_size = config.TEMPORAL.CHILD_WORKFLOW_BATCH_SIZE

        # Phase 3-5: Extract claims in child workflow batches (bounded history per child)
        all_chunks = text_chunks + table_chunks
        chunk_batches = [all_chunks[i : i + batch_size] for i in range(0, len(all_chunks), batch_size)]

        batch_results: list[ExtractionBatchOutput] = await sliding_window(
            chunk_batches,
            lambda batch: workflow.execute_child_workflow(
                ClaimExtractionBatchWorkflow.run,
                arg=ExtractionBatchInput(
                    project_id=inp.project_id,
                    document_id=inp.document_id,
                    is_erlaeuterungsbericht=inp.is_erlaeuterungsbericht,
                    text_chunks=[c for c in batch if c.chunk_type == "text"],
                    table_chunks=[c for c in batch if c.chunk_type == "table"],
                ),
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(seconds=60),
            ),
            concurrency=config.TEMPORAL.MAX_CONCURRENT_CHILD_WORKFLOWS,
        )
        all_claims = [claim for result in batch_results for claim in result.claims]

        # Phase 6: Embed (shared activity) and upload all claims in batches
        embedding_model: EmbeddingModel = ENV.LITELLM.EMBEDDING_MODEL
        upload_batch_size = config.EMBEDDING.UPLOAD_BATCH_SIZE
        claim_batches = [all_claims[i : i + upload_batch_size] for i in range(0, len(all_claims), upload_batch_size)]

        await sliding_window(
            claim_batches,
            lambda batch: _embed_and_upload_claims(batch, embedding_model),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )
        workflow.logger.info(f"Successfully processed document {inp.document_id}")


async def _embed_and_upload_claims(
    claims: list[ClaimPayload],
    embedding_model: EmbeddingModel,
) -> None:
    """Embed a batch of claims via the shared embedding activity, then upload to Qdrant.

    Splits embedding across batches inside ``embedding_invoke`` and dispatches a
    single upsert activity per claim batch.
    """
    if not claims:
        return

    texts = [c.claim_text for c in claims]
    vectors = await embedding_invoke(texts, model=embedding_model)
    for claim, vector in zip(claims, vectors, strict=True):
        claim.vector = vector

    await workflow.execute_activity(
        upload_claims_to_qdrant,
        arg=UploadClaimsInput(claims=claims),
        start_to_close_timeout=timedelta(seconds=config.TEMPORAL.UPLOAD_ACTIVITY_TIMEOUT_SECONDS),
        retry_policy=RetryPolicy(
            maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
            initial_interval=timedelta(seconds=10),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=30),
        ),
    )


@workflow.defn
class ClaimExtractionOrchestratorWorkflow:
    """Orchestrates claim extraction and indexing across multiple documents."""

    @workflow.run
    async def run(self, inp: OrchestratorInputSchema) -> None:
        workflow.logger.info(f"Starting orchestration for {len(inp.document_ids)} documents.")

        await workflow.execute_activity(
            init_qdrant_collection,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(maximum_attempts=config.QDRANT_BUILDER.DEFAULT_ACTIVITY_RETRIES),
        )

        erlauterungsbericht_ids = inp.erlaeuterungsbericht_document_ids
        if not erlauterungsbericht_ids:
            erlauterungsbericht_ids = await workflow.execute_activity(  # type: ignore[no-matching-overload]
                fetch_erlauterungsbericht_document_ids,
                inp.classification_file_id,
                start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            )
        erlauterungsbericht_set = set(erlauterungsbericht_ids)
        workflow.logger.info(f"Found {len(erlauterungsbericht_ids)} Erläuterungsbericht documents.")

        await sliding_window(
            inp.document_ids,
            lambda doc_id: workflow.execute_child_workflow(
                ClaimExtractionSingleDocumentWorkflow.run,
                arg=SingleDocumentWorkflowInputSchema(
                    project_id=inp.project_id,
                    document_id=doc_id,
                    is_erlaeuterungsbericht=doc_id in erlauterungsbericht_set,
                ),
                task_queue=workflow.info().task_queue,
                id=f"qdrant-worker-{inp.project_id}-{doc_id}",
                task_timeout=timedelta(seconds=60),
            ),
            concurrency=config.TEMPORAL.MAX_CONCURRENT_CHILD_WORKFLOWS,
        )
        workflow.logger.info("All document workers finished successfully.")
