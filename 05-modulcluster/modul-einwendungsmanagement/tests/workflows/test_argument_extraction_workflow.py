import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from unittest.mock import patch

import pytest
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentExtractionOutput,
    ArgumentExtractionParams,
)
from temporal.workflows.inhaltsextraktion.types import (
    ChunkEWMS,
    PromptInjection,
    SingleDocumentEWMSWorkflowOutput,
)
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.activities.argument_extraction_activities import span_positions
from src.schemas.argument_extraction_schemas import (
    ArgumentExtractionLLMResult,
    MultiArgumentsExtractionLLMResult,
    ResidualContextAssignmentItem,
    ResidualContextAssignmentResult,
)
from src.workflows import (
    ArgumentExtractionSingleBatchWorkflow,
    ArgumentExtractionWorkflow,
)

LLM_TARGET = "src.workflows.argument_extraction_batch_workflow.llm_invoke_structured_guarded"

CHUNK_TEXT = (
    "Der Laermschutz ist unzureichend. Die geplante Trasse verlaeuft zu nah am Wohngebiet. "
    "Zudem fehlt ein Nachweis zur Grundwasserabsenkung."
)


async def _fake_llm_invoke(*args, output_class, template_kwargs=None, **kwargs):
    if output_class is MultiArgumentsExtractionLLMResult:
        return MultiArgumentsExtractionLLMResult(
            extracted_arguments=[
                ArgumentExtractionLLMResult(
                    argument="Der Laermschutz ist unzureichend.",
                    context=None,
                    description="Insufficient noise protection.",
                ),
                ArgumentExtractionLLMResult(
                    argument="fehlt ein Nachweis zur Grundwasserabsenkung",
                    context=None,
                    description="Missing groundwater lowering proof.",
                ),
            ]
        )
    if output_class is ResidualContextAssignmentResult:
        batch = template_kwargs["residual_batch"]
        return ResidualContextAssignmentResult(
            results=[ResidualContextAssignmentItem(reasoning="left", assigned_idx=0) for _ in batch]
        )
    raise AssertionError(f"unexpected output_class {output_class}")


def _make_params(num_docs: int) -> ArgumentExtractionParams:
    docs = [
        SingleDocumentEWMSWorkflowOutput(
            prompt_injection=PromptInjection(injection_detected=False),
            markdown=CHUNK_TEXT,
            original_file_id=f"doc-{d}",
            chunks=[ChunkEWMS(page_content=CHUNK_TEXT, page_numbers=[1])],
        )
        for d in range(num_docs)
    ]
    return ArgumentExtractionParams(processed_files_output=docs)


@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_argument_extraction_end_to_end():
    """Parent fans out to batch children, real span_positions runs, LLM mocked.

    Verifies aggregation preserves all input documents in order and that grounded
    arguments survive the full pipeline.
    """
    num_docs = 3

    with ExitStack() as stack:
        stack.enter_context(patch(LLM_TARGET, _fake_llm_invoke))
        async with await WorkflowEnvironment.start_time_skipping(data_converter=pydantic_data_converter) as env:
            task_queue = f"queue-{uuid.uuid4()}"
            with ThreadPoolExecutor(max_workers=4) as executor:
                async with Worker(
                    env.client,
                    workflows=[ArgumentExtractionWorkflow, ArgumentExtractionSingleBatchWorkflow],
                    activities=[span_positions],
                    activity_executor=executor,
                    task_queue=task_queue,
                    workflow_runner=UnsandboxedWorkflowRunner(),
                ):
                    result = await env.client.execute_workflow(
                        ArgumentExtractionWorkflow.run,
                        _make_params(num_docs),
                        id=f"wf-{uuid.uuid4()}",
                        task_queue=task_queue,
                    )

    assert isinstance(result, ArgumentExtractionOutput)
    assert len(result.document_arguments) == num_docs
    assert [d.document_id for d in result.document_arguments] == [f"doc-{i}" for i in range(num_docs)]

    found = [
        arg.argument.text for doc in result.document_arguments for ca in doc.chunk_arguments for arg in ca.arguments
    ]
    assert any("aermschutz" in t for t in found)
