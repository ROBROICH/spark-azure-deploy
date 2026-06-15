from uuid import uuid4

import pytest
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentRecord,
    ArgumentSubtopic,
    ArgumentTopic,
    ClassifiedArgument,
    ExtractedArgument,
    Segment,
    TextSpan,
)

from src.schemas.argument_classification_schemas import ArgumentClassificationItem
from src.workflows.argument_classification_batch_workflow import ArgumentClassificationSingleBatchWorkflow


def _extracted_argument(text: str) -> ExtractedArgument:
    span = TextSpan(start_idx=0, end_idx=len(text))
    segment = Segment(text=text, span=span)
    return ExtractedArgument(argument=segment, description=text, context=segment)


@pytest.mark.asyncio
async def test_classify_subtopics_preserves_order_for_non_positional_argument_ids() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    subtopic = ArgumentSubtopic(topic_id=uuid4(), name="Subtopic", description="Subtopic description")
    topic = ArgumentTopic(
        topic_id=uuid4(),
        name="Topic",
        description="Topic description",
        subtopics=[subtopic],
    )
    topic_results = [
        ClassifiedArgument(
            argument_record=ArgumentRecord(argument_id=uuid4(), extracted_argument=_extracted_argument("first")),
            topic=topic,
            subtopic=None,
            reasoning="topic reasoning 1",
            confidence=0.8,
        ),
        ClassifiedArgument(
            argument_record=ArgumentRecord(argument_id=uuid4(), extracted_argument=_extracted_argument("second")),
            topic=topic,
            subtopic=None,
            reasoning="topic reasoning 2",
            confidence=0.6,
        ),
    ]

    async def fake_subtopic_inference(
        tasks: list[tuple[list[ClassifiedArgument], list[ArgumentSubtopic]]],
    ) -> list[list[ArgumentClassificationItem]]:
        return [
            [
                ArgumentClassificationItem(reasoning="subtopic reasoning", idx=0, confidence=0.9)
                for _ in arg_batch
            ]
            for arg_batch, _ in tasks
        ]

    workflow._run_initial_subtopic_inference = fake_subtopic_inference  # type: ignore[method-assign]

    result = await workflow._classify_subtopics(topic_results)

    assert [item.argument_record.argument_id for item in result] == [
        item.argument_record.argument_id for item in topic_results
    ]
    assert [item.subtopic for item in result] == [subtopic, subtopic]
