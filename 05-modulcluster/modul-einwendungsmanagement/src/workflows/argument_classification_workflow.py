"""
This module defines the primary ArgumentClassificationWorkflow for the objection management system.

The workflow implements a Fan-Out architectural pattern to classify large volumes of
extracted arguments. It partitions the argument records into batches and processes them
in parallel using child workflows, ensuring efficient handling of LLM classification tasks.
"""

from datetime import timedelta

from temporal.utils import sliding_window
from temporal.workflows.einwendungsmanagement.types import (
    ARGUMENT_CLASSIFICATION_WORKFLOW_ID,
    ArgumentClassificationOutput,
    ArgumentClassificationParams,
)
from temporalio import workflow

from src.config.config import config
from src.workflows import ArgumentClassificationSingleBatchWorkflow


@workflow.defn(name=ARGUMENT_CLASSIFICATION_WORKFLOW_ID)
class ArgumentClassificationWorkflow:
    """
    Orchestrates the classification of arguments across multiple documents.

    This workflow acts as a parent coordinator that divides the set of documents
    (containing extracted arguments) into batches and manages their concurrent
    classification via child workflows.
    """

    @workflow.run
    async def run(self, params: ArgumentClassificationParams) -> ArgumentClassificationOutput:
        """
        Executes the argument classification process using a parallel batch-based approach.

        The execution follows these primary phases:
        1. Partitioning: Splitting the input argument records into sub-lists (batches).
        2. Parallel Execution: Running classification child workflows with concurrency control.
        3. Aggregation: Merging classified results back into a single unified output.
        """

        # --- Step 1: Batch Partitioning ---
        argument_records_batches = [
            params.argument_records[i : i + config.ARGUMENT_CLASSIFICATION.ARGUMENTS_BATCH_SIZE]
            for i in range(0, len(params.argument_records), config.ARGUMENT_CLASSIFICATION.ARGUMENTS_BATCH_SIZE)
        ]

        async def batch_worker(idx: int) -> tuple[int, ArgumentClassificationOutput]:
            """
            Internal helper function to execute a single classification child workflow batch.
            """
            batch_child_id = f"arg-classification-batch-{idx}-{workflow.info().workflow_id[:8]}"

            classification_output: ArgumentClassificationOutput = await workflow.execute_child_workflow(
                ArgumentClassificationSingleBatchWorkflow.run,
                ArgumentClassificationParams(
                    argument_records=argument_records_batches[idx], topics=params.topics
                ),
                id=batch_child_id,
                task_timeout=timedelta(seconds=config.TEMPORAL.TASK_TIMEOUT),
            )
            return idx, classification_output

        # --- Step 2: Orchestration via Sliding Window ---
        indexed_results = await sliding_window(
            list(range(len(argument_records_batches))),
            batch_worker,
            concurrency=config.ARGUMENT_CLASSIFICATION.CONCURRENT_BATCHES,
        )
        sorted_results = [res for _, res in sorted(indexed_results)]

        # --- Step 3: Result Aggregation ---
        final_output = ArgumentClassificationOutput(
            classified_arguments=[
                classified_argument
                for batch_res in sorted_results
                for classified_argument in batch_res.classified_arguments
            ]
        )

        return final_output
