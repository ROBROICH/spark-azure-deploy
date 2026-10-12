from uuid import uuid4

import pytest
from temporal.contracts import (
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


def _argument_record(text: str) -> ArgumentRecord:
    return ArgumentRecord(argument_id=uuid4(), extracted_argument=_extracted_argument(text))


def _topic(*, with_subtopics: bool = True) -> tuple[ArgumentTopic, ArgumentSubtopic | None]:
    topic_id = uuid4()
    subtopic = (
        ArgumentSubtopic(topic_id=topic_id, name="Subtopic", description="Subtopic description")
        if with_subtopics
        else None
    )
    topic = ArgumentTopic(
        topic_id=topic_id,
        name="Topic",
        description="Topic description",
        subtopics=[subtopic] if subtopic is not None else [],
    )
    return topic, subtopic


def _classified(
    record: ArgumentRecord,
    topic: ArgumentTopic | None,
    *,
    confidence: float,
    topic_confidence: float | None,
) -> ClassifiedArgument:
    return ClassifiedArgument(
        argument_record=record,
        topic=topic,
        subtopic=None,
        reasoning="topic reasoning",
        confidence=confidence,
        topic_confidence=topic_confidence,
        subtopic_confidence=None,
    )


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
            topic_confidence=0.8,
            subtopic_confidence=None,
        ),
        ClassifiedArgument(
            argument_record=ArgumentRecord(argument_id=uuid4(), extracted_argument=_extracted_argument("second")),
            topic=topic,
            subtopic=None,
            reasoning="topic reasoning 2",
            confidence=0.6,
            topic_confidence=0.6,
            subtopic_confidence=None,
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


@pytest.mark.asyncio
async def test_classify_topics_hit_sets_topic_confidence_and_null_subtopic() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    record = _argument_record("assigned topic only")
    topic, _ = _topic()
    topic_hit_confidence = 0.75

    async def fake_topic_inference(
        tasks: list[tuple[list[ArgumentRecord], list[ArgumentTopic]]],
    ) -> list[tuple[list[ArgumentRecord], list[ArgumentTopic], list[ArgumentClassificationItem]]]:
        return [
            (
                arg_batch,
                topic_batch,
                [
                    ArgumentClassificationItem(reasoning="topic hit", idx=0, confidence=topic_hit_confidence)
                    for _ in arg_batch
                ],
            )
            for arg_batch, topic_batch in tasks
        ]

    workflow._run_initial_topic_inference = fake_topic_inference  # type: ignore[method-assign]

    result = await workflow._classify_topics(records=[record], topics=[topic])

    assert len(result) == 1
    assert result[0].topic == topic
    assert result[0].subtopic is None
    assert result[0].confidence == topic_hit_confidence
    assert result[0].topic_confidence == topic_hit_confidence
    assert result[0].subtopic_confidence is None


@pytest.mark.asyncio
async def test_classify_topics_no_hit_sets_both_confidences_null() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    record = _argument_record("unassigned")
    topic, _ = _topic()
    rejection_confidence = 0.2

    async def fake_topic_inference(
        tasks: list[tuple[list[ArgumentRecord], list[ArgumentTopic]]],
    ) -> list[tuple[list[ArgumentRecord], list[ArgumentTopic], list[ArgumentClassificationItem]]]:
        return [
            (
                arg_batch,
                topic_batch,
                [
                    ArgumentClassificationItem(reasoning="no topic", idx=-1, confidence=rejection_confidence)
                    for _ in arg_batch
                ],
            )
            for arg_batch, topic_batch in tasks
        ]

    workflow._run_initial_topic_inference = fake_topic_inference  # type: ignore[method-assign]

    result = await workflow._classify_topics(records=[record], topics=[topic])

    assert len(result) == 1
    assert result[0].topic is None
    assert result[0].subtopic is None
    assert result[0].confidence == rejection_confidence
    assert result[0].topic_confidence is None
    assert result[0].subtopic_confidence is None


@pytest.mark.asyncio
async def test_classify_subtopics_hit_carries_topic_and_sets_subtopic_confidence() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    topic, subtopic = _topic()
    assert subtopic is not None
    topic_hit_confidence = 0.8
    subtopic_hit_confidence = 0.9
    topic_results = [
        _classified(
            _argument_record("both assigned"),
            topic,
            confidence=topic_hit_confidence,
            topic_confidence=topic_hit_confidence,
        )
    ]

    async def fake_subtopic_inference(
        tasks: list[tuple[list[ClassifiedArgument], list[ArgumentSubtopic]]],
    ) -> list[list[ArgumentClassificationItem]]:
        return [
            [
                ArgumentClassificationItem(reasoning="subtopic hit", idx=0, confidence=subtopic_hit_confidence)
                for _ in arg_batch
            ]
            for arg_batch, _ in tasks
        ]

    workflow._run_initial_subtopic_inference = fake_subtopic_inference  # type: ignore[method-assign]

    result = await workflow._classify_subtopics(topic_results)

    assert len(result) == 1
    assert result[0].topic == topic
    assert result[0].subtopic == subtopic
    assert result[0].confidence == (topic_hit_confidence + subtopic_hit_confidence) / 2.0
    assert result[0].topic_confidence == topic_hit_confidence
    assert result[0].subtopic_confidence == subtopic_hit_confidence


@pytest.mark.asyncio
async def test_classify_subtopics_no_hit_carries_topic_confidence_and_nulls_subtopic() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    topic, _ = _topic()
    topic_hit_confidence = 0.8
    subtopic_rejection_confidence = 0.3
    topic_results = [
        _classified(
            _argument_record("topic only"),
            topic,
            confidence=topic_hit_confidence,
            topic_confidence=topic_hit_confidence,
        )
    ]

    async def fake_subtopic_inference(
        tasks: list[tuple[list[ClassifiedArgument], list[ArgumentSubtopic]]],
    ) -> list[list[ArgumentClassificationItem]]:
        return [
            [
                ArgumentClassificationItem(
                    reasoning="no subtopic", idx=-1, confidence=subtopic_rejection_confidence
                )
                for _ in arg_batch
            ]
            for arg_batch, _ in tasks
        ]

    workflow._run_initial_subtopic_inference = fake_subtopic_inference  # type: ignore[method-assign]

    result = await workflow._classify_subtopics(topic_results)

    assert len(result) == 1
    assert result[0].topic == topic
    assert result[0].subtopic is None
    assert result[0].confidence == (topic_hit_confidence + subtopic_rejection_confidence) / 2.0
    assert result[0].topic_confidence == topic_hit_confidence
    assert result[0].subtopic_confidence is None


@pytest.mark.asyncio
async def test_malformed_batch_guard_rail_sets_both_confidences_null() -> None:
    workflow = ArgumentClassificationSingleBatchWorkflow()
    record = _argument_record("malformed batch")
    topic, _ = _topic()
    dropped = [
        ArgumentClassificationItem(
            reasoning="LLM list length mismatch failure. Argument was dropped during inference.",
            idx=-1,
            confidence=0.0,
        )
    ]

    async def fake_topic_inference(
        tasks: list[tuple[list[ArgumentRecord], list[ArgumentTopic]]],
    ) -> list[tuple[list[ArgumentRecord], list[ArgumentTopic], list[ArgumentClassificationItem]]]:
        return [(arg_batch, topic_batch, dropped) for arg_batch, topic_batch in tasks]

    workflow._run_initial_topic_inference = fake_topic_inference  # type: ignore[method-assign]

    result = await workflow._classify_topics(records=[record], topics=[topic])

    assert len(result) == 1
    assert result[0].topic is None
    assert result[0].subtopic is None
    assert result[0].confidence == 0.0
    assert result[0].topic_confidence is None
    assert result[0].subtopic_confidence is None
