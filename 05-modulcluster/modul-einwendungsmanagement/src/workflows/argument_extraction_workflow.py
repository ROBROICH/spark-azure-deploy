"""
This module defines the primary ArgumentExtractionWorkflow for the objection management system.

The workflow implements a Fan-Out architectural pattern to process large volumes of documents
efficiently. It partitions input data into manageable batches and processes them in parallel
using child workflows, ensuring scalability and preventing individual task timeouts.
"""

from datetime import timedelta

from temporal.utils import sliding_window
from temporal.workflows.einwendungsmanagement.types import (
    ARGUMENT_EXTRACTION_WORKFLOW_ID,
    ArgumentExtractionOutput,
    ArgumentExtractionParams,
)
from temporalio import workflow

from src.config.config import config
from src.workflows import ArgumentExtractionSingleBatchWorkflow


@workflow.defn(name=ARGUMENT_EXTRACTION_WORKFLOW_ID)
class ArgumentExtractionWorkflow:
    """
    Orchestrates the extraction of arguments from a list of processed documents.

    This workflow acts as a parent coordinator that divides the total document set
    into batches and manages their concurrent execution via child workflows.
    """

    @workflow.run
    async def run(self, params: ArgumentExtractionParams) -> ArgumentExtractionOutput:
        """
        Executes the argument extraction process using a batch-based approach.

        The execution follows these primary phases:
        1. Partitioning: Splitting the input document list into sub-lists (batches).
        2. Parallel Execution: Running child workflows for each batch with concurrency control.
        3. Aggregation: Consolidating batch results into a single, unified output.
        """

        # --- Step 1: Batch Partitioning ---
        document_batches = [
            params.processed_files_output[i : i + config.ARGUMENT_EXTRACTION.DOCUMENTS_BATCH_SIZE]
            for i in range(0, len(params.processed_files_output), config.ARGUMENT_EXTRACTION.DOCUMENTS_BATCH_SIZE)
        ]

        async def batch_worker(idx: int) -> tuple[int, ArgumentExtractionOutput]:
            """
            Internal helper function to execute a single child workflow batch.
            """
            batch_child_id = f"arg-extraction-batch-{idx}-{workflow.info().workflow_id[:8]}"

            # Execute the batch extraction as a child workflow
            extraction_output: ArgumentExtractionOutput = await workflow.execute_child_workflow(
                ArgumentExtractionSingleBatchWorkflow.run,
                ArgumentExtractionParams(processed_files_output=document_batches[idx]),
                id=batch_child_id,
                task_timeout=timedelta(seconds=config.TEMPORAL.TASK_TIMEOUT),
            )
            return idx, extraction_output

        # --- Step 2: Orchestration via Sliding Window ---
        indexed_results = await sliding_window(
            list(range(len(document_batches))),
            batch_worker,
            concurrency=config.ARGUMENT_EXTRACTION.CONCURRENT_BATCHES,
        )
        sorted_results = [res for _, res in sorted(indexed_results)]

        # --- Step 3: Result Aggregation ---
        final_output = ArgumentExtractionOutput(
            document_arguments=[doc_arg for batch_res in sorted_results for doc_arg in batch_res.document_arguments]
        )

        return final_output
