import uuid
from contextlib import ExitStack
from unittest.mock import patch

import pytest
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentClassificationOutput,
    ArgumentClassificationParams,
    ArgumentRecord,
    ArgumentSubtopic,
    ArgumentTopic,
    ExtractedArgument,
    Segment,
    TextSpan,
)
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.schemas.argument_classification_schemas import (
    ArgumentClassificationItem,
    ArgumentClassificationResult,
)
from src.workflows import (
    ArgumentClassificationSingleBatchWorkflow,
    ArgumentClassificationWorkflow,
)

LLM_TARGET = "src.workflows.argument_classification_batch_workflow.llm_invoke_structured_guarded"

calls = {"topic": 0, "subtopic": 0}


async def _fake_llm_invoke(*args, output_class, template_kwargs=None, **kwargs):
    assert output_class is ArgumentClassificationResult
    kw = template_kwargs or {}
    # topic call passes "topics"; subtopic call passes "subtopics"
    if "topics" in kw:
        calls["topic"] += 1
        n = len(kw["argument_records"])
    else:
        calls["subtopic"] += 1
        n = len(kw["classified_arguments"])
    # idx=0 -> always hit the first topic/subtopic in the batch
    return ArgumentClassificationResult(
        results=[ArgumentClassificationItem(reasoning="hit", idx=0, confidence=0.9) for _ in range(n)]
    )


def _make_arg(text: str) -> ExtractedArgument:
    seg = Segment(text=text, span=TextSpan(start_idx=0, end_idx=len(text)))
    return ExtractedArgument(argument=seg, description=text, context=seg)


def _make_params(num_args: int) -> ArgumentClassificationParams:
    topic_id = uuid.uuid4()
    subtopic = ArgumentSubtopic(
        subtopic_id=uuid.uuid4(),
        topic_id=topic_id,
        name="Laerm bei Nacht",
        description="Naechtliche Laermbelastung.",
    )
    topic = ArgumentTopic(
        topic_id=topic_id,
        name="Immissionsschutz",
        description="Schutz vor Immissionen.",
        subtopics=[subtopic],
    )
    records = [
        ArgumentRecord(argument_id=uuid.uuid4(), extracted_argument=_make_arg(f"Argument {i}")) for i in range(num_args)
    ]
    return ArgumentClassificationParams(argument_records=records, topics=[topic])


@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_argument_classification_end_to_end():
    """Parent fans out to classification child workflows; both topic and subtopic
    LLM stages are exercised. Verifies order preservation and full assignment."""
    calls["topic"] = 0
    calls["subtopic"] = 0
    num_args = 3

    with ExitStack() as stack:
        stack.enter_context(patch(LLM_TARGET, _fake_llm_invoke))
        async with await WorkflowEnvironment.start_time_skipping(data_converter=pydantic_data_converter) as env:
            task_queue = f"queue-{uuid.uuid4()}"
            async with Worker(
                env.client,
                workflows=[
                    ArgumentClassificationWorkflow,
                    ArgumentClassificationSingleBatchWorkflow,
                ],
                task_queue=task_queue,
                workflow_runner=UnsandboxedWorkflowRunner(),
            ):
                params = _make_params(num_args)
                result = await env.client.execute_workflow(
                    ArgumentClassificationWorkflow.run,
                    params,
                    id=f"wf-{uuid.uuid4()}",
                    task_queue=task_queue,
                )

    assert isinstance(result, ArgumentClassificationOutput)
    assert len(result.classified_arguments) == num_args

    input_ids = [r.argument_id for r in params.argument_records]
    out_ids = [c.argument_record.argument_id for c in result.classified_arguments]
    assert out_ids == input_ids

    assert calls["topic"] >= 1
    assert calls["subtopic"] >= 1
    # idx=0 hit -> topic assigned, then its subtopic assigned
    first = result.classified_arguments[0]
    assert first.topic is not None
    assert first.subtopic is not None
