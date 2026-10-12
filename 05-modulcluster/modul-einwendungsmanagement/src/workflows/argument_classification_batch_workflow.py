"""Workflow for the automated classification of legal arguments.

This module orchestrates the two-tiered classification of extracted legal arguments
by mapping them to predefined topics and subsequent granular subtopics
using a batch-based parallel LLM inference strategy.
"""

from uuid import UUID

from temporal.activities.llm_guarded import llm_invoke_structured_guarded
from temporal.contracts import (
    ArgumentClassificationOutput,
    ArgumentClassificationParams,
    ArgumentRecord,
    ArgumentSubtopic,
    ArgumentTopic,
    ClassifiedArgument,
)
from temporal.utils import sliding_window
from temporalio import workflow

from src.config.config import config
from src.prompts.argument_classification_prompts import (
    ARGUMENT_SUBTOPIC_CLASSIFICATION_SYSTEM_PROMPT,
    ARGUMENT_SUBTOPIC_CLASSIFICATION_USER_PROMPT,
    ARGUMENT_TOPIC_CLASSIFICATION_SYSTEM_PROMPT,
    ARGUMENT_TOPIC_CLASSIFICATION_USER_PROMPT,
)
from src.schemas.argument_classification_schemas import (
    ArgumentClassificationItem,
    ArgumentClassificationResult,
)


@workflow.defn
class ArgumentClassificationSingleBatchWorkflow:
    """Workflow for classifying legal arguments into thematic topics and subtopics for a single batch of arguments.

    Manages a high-concurrency pipeline applying a two-stage logic:
    1. Topic Classification: Arguments are batched and checked against topic batches.
    2. Subtopic Classification: Successful topic matches are further batched and
       checked against their respective subtopics.
    3. Resolution: Ambiguities (multiple hits) are resolved via an additional LLM call
       comparing the top hits. Missing classifications are resolved by aggregating
       the reasonings and averaging confidences (no extra fallback LLM calls).
    """

    @workflow.run
    async def run(self, params: ArgumentClassificationParams) -> ArgumentClassificationOutput:
        """Executes the argument classification workflow."""

        # Stage 1: Main Topic Classification
        topic_results = await self._classify_topics(records=params.argument_records, topics=params.topics)

        # Stage 2: Subtopic Classification
        final_arguments = await self._classify_subtopics(topic_results)

        return ArgumentClassificationOutput(classified_arguments=final_arguments)

    async def _classify_topics(
        self, records: list[ArgumentRecord], topics: list[ArgumentTopic]
    ) -> list[ClassifiedArgument]:
        """Main orchestrator for batch-based main topic classification."""
        arg_batch_size = config.ARGUMENT_CLASSIFICATION_BATCH.ARGUMENTS_BATCH_SIZE
        topic_batch_size = config.ARGUMENT_CLASSIFICATION_BATCH.TOPICS_BATCH_SIZE

        arg_batches = [records[i : i + arg_batch_size] for i in range(0, len(records), arg_batch_size)]
        topic_batches = [topics[i : i + topic_batch_size] for i in range(0, len(topics), topic_batch_size)]

        # 1. Create a flat list of tasks (cartesian product of arg_batches and topic_batches)
        inference_tasks = [(ab, cb) for ab in arg_batches for cb in topic_batches]

        # 2. Run parallel initial inference
        raw_results = await self._run_initial_topic_inference(inference_tasks)

        # 3. Group results by input position.
        grouped_results: dict[
            UUID,
            tuple[ArgumentRecord, list[tuple[ArgumentTopic, ArgumentClassificationItem]], list[str], list[float]],
        ] = {record.argument_id: (record, [], [], []) for record in records}

        for arg_batch, topic_batch, batch_result in raw_results:
            for arg, item in zip(arg_batch, batch_result, strict=True):
                _, hits, reasonings, confidences = grouped_results[arg.argument_id]

                if item.idx != -1 and 0 <= item.idx < len(topic_batch):
                    hits.append((topic_batch[item.idx], item))
                else:
                    reasonings.append(item.reasoning)
                    confidences.append(item.confidence)

        # 4. Resolve overlaps locally (pick highest confidence) and construct final classified arguments
        final_results: list[ClassifiedArgument] = []

        # Iterate over original records to ensure the exact original order is maintained
        for record, hits, reasonings, confidences in grouped_results.values():
            if hits:
                # Pick the hit with the maximum confidence score
                best_topic, best_item = max(hits, key=lambda x: x[1].confidence)
                final_results.append(
                    ClassifiedArgument(
                        argument_record=record,
                        topic=best_topic,
                        subtopic=None,
                        reasoning=best_item.reasoning,
                        confidence=best_item.confidence,
                        topic_confidence=best_item.confidence,
                        subtopic_confidence=None,
                    )
                )
            else:
                # No hits found, aggregate the fallback reasonings
                avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
                final_results.append(
                    ClassifiedArgument(
                        argument_record=record,
                        topic=None,
                        subtopic=None,
                        reasoning="Themen-Prüfung:\n" + "\n".join(reasonings),
                        confidence=avg_conf,
                        topic_confidence=None,
                        subtopic_confidence=None,
                    )
                )

        return final_results

    async def _run_initial_topic_inference(
        self, tasks: list[tuple[list[ArgumentRecord], list[ArgumentTopic]]]
    ) -> list[tuple[list[ArgumentRecord], list[ArgumentTopic], list[ArgumentClassificationItem]]]:
        """Executes the flat sliding window over all argument/topic batch combinations."""

        async def worker(
            idx: int,
        ) -> tuple[int, tuple[list[ArgumentRecord], list[ArgumentTopic], list[ArgumentClassificationItem]]]:
            arg_batch, topic_batch = tasks[idx]
            result = await self._invoke_topic_batch(arg_batch, topic_batch)
            return idx, (arg_batch, topic_batch, result)

        indexed_results = await sliding_window(
            items=list(range(len(tasks))),
            fn=worker,
            concurrency=config.TEMPORAL.MAX_ASYNC_CONCURRENT_ACTIVITIES,
        )

        return [res for _, res in sorted(indexed_results)]

    async def _classify_subtopics(self, topic_results: list[ClassifiedArgument]) -> list[ClassifiedArgument]:
        """Main orchestrator for batch-based granular subtopic classification."""
        arg_batch_size = config.ARGUMENT_CLASSIFICATION_BATCH.ARGUMENTS_BATCH_SIZE
        subtopic_batch_size = config.ARGUMENT_CLASSIFICATION_BATCH.SUBTOPICS_BATCH_SIZE

        # 1. Group arguments by their main topic to allow argument batching
        grouped_by_topic: dict[UUID, list[ClassifiedArgument]] = {}
        final_results: dict[UUID, ClassifiedArgument] = {}

        for arg in topic_results:
            if arg.topic and arg.topic.subtopics:
                grouped_by_topic.setdefault(arg.topic.topic_id, []).append(arg)
            else:
                final_results[arg.argument_record.argument_id] = arg

        # 2. Prepare flat list of inference tasks (cartesian product of arg & subtopic batches per topic)
        inference_tasks: list[tuple[list[ClassifiedArgument], list[ArgumentSubtopic]]] = []

        for args_in_topic in grouped_by_topic.values():
            topic = args_in_topic[0].topic
            if topic is None:
                continue
            subtopics = topic.subtopics

            # Chunk arguments and subtopics
            arg_batches = [args_in_topic[i : i + arg_batch_size] for i in range(0, len(args_in_topic), arg_batch_size)]
            subtopic_batches = [
                subtopics[i : i + subtopic_batch_size] for i in range(0, len(subtopics), subtopic_batch_size)
            ]

            for ab in arg_batches:
                for sb in subtopic_batches:
                    inference_tasks.append((ab, sb))

        if not inference_tasks:
            return topic_results

        # 3. Run parallel initial inference
        raw_results = await self._run_initial_subtopic_inference(inference_tasks)

        # 4. Aggregate results per argument
        arg_results: dict[
            UUID,
            tuple[
                ClassifiedArgument, list[tuple[ArgumentSubtopic, ArgumentClassificationItem]], list[str], list[float]
            ],
        ] = {arg.argument_record.argument_id: (arg, [], [], []) for args in grouped_by_topic.values() for arg in args}

        for (arg_batch, subtopic_batch), result_batch in zip(inference_tasks, raw_results, strict=True):
            for arg, result_item in zip(arg_batch, result_batch, strict=True):
                _, hits, reasonings, confidences = arg_results[arg.argument_record.argument_id]

                if result_item.idx != -1 and 0 <= result_item.idx < len(subtopic_batch):
                    hits.append((subtopic_batch[result_item.idx], result_item))
                else:
                    reasonings.append(result_item.reasoning)
                    confidences.append(result_item.confidence)

        # 5. Resolve overlaps locally (pick highest confidence) and build final objects
        for result_idx, (arg, hits, reasonings, confidences) in arg_results.items():
            if hits:
                best_subtopic, best_item = max(hits, key=lambda x: x[1].confidence)
                final_results[result_idx] = ClassifiedArgument(
                    argument_record=arg.argument_record,
                    topic=arg.topic,
                    subtopic=best_subtopic,
                    reasoning=f"{arg.reasoning}\n\nUnterthema Begründung:\n{best_item.reasoning}",
                    confidence=(arg.confidence + best_item.confidence) / 2.0,
                    topic_confidence=arg.topic_confidence,
                    subtopic_confidence=best_item.confidence,
                )
            else:
                avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
                final_results[result_idx] = ClassifiedArgument(
                    argument_record=arg.argument_record,
                    topic=arg.topic,
                    subtopic=None,
                    reasoning=f"{arg.reasoning}\n\nUnterthema abgelehnt:\n" + "\n".join(reasonings),
                    confidence=(arg.confidence + avg_conf) / 2.0,
                    topic_confidence=arg.topic_confidence,
                    subtopic_confidence=None,
                )

        # 6. Return mapped results in exact original order
        return [final_results[arg.argument_record.argument_id] for arg in topic_results]

    async def _run_initial_subtopic_inference(
        self, tasks: list[tuple[list[ClassifiedArgument], list[ArgumentSubtopic]]]
    ) -> list[list[ArgumentClassificationItem]]:
        """Executes the flat sliding window over argument and subtopic batch combinations."""

        async def worker(idx: int) -> tuple[int, list[ArgumentClassificationItem]]:
            arg_batch, subtopic_batch = tasks[idx]
            result = await self._invoke_subtopic_batch(arg_batch, subtopic_batch)
            return idx, result

        indexed_results = await sliding_window(
            items=list(range(len(tasks))),
            fn=worker,
            concurrency=config.TEMPORAL.MAX_ASYNC_CONCURRENT_ACTIVITIES,
        )

        return [res for _, res in sorted(indexed_results)]

    async def _invoke_topic_batch(
        self, arg_batch: list[ArgumentRecord], topic_batch: list[ArgumentTopic]
    ) -> list[ArgumentClassificationItem]:
        """Invokes LLM for topic classification and validates length output."""
        arg_records = [arg.extracted_argument for arg in arg_batch]

        result: ArgumentClassificationResult = await llm_invoke_structured_guarded(
            prompt_template=ARGUMENT_TOPIC_CLASSIFICATION_USER_PROMPT,
            template_kwargs={"argument_records": arg_records, "topics": topic_batch},
            system_prompt=ARGUMENT_TOPIC_CLASSIFICATION_SYSTEM_PROMPT,
            output_class=ArgumentClassificationResult,
            model=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.model_name,
            temperature=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.temperature,
            top_p=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.top_p,
            max_tokens=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.max_tokens,
            reasoning_effort=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.reasoning_effort,
        )

        return self._enforce_batch_length(result.results, len(arg_batch))

    async def _invoke_subtopic_batch(
        self, classified_arg_batch: list[ClassifiedArgument], subtopics: list[ArgumentSubtopic]
    ) -> list[ArgumentClassificationItem]:
        """Invokes LLM for granular subtopic classification of a batch of arguments."""

        ext_args = [arg.argument_record.extracted_argument for arg in classified_arg_batch]

        parent_topic_name = ""
        if classified_arg_batch and classified_arg_batch[0].topic:
            parent_topic_name = classified_arg_batch[0].topic.name

        result: ArgumentClassificationResult = await llm_invoke_structured_guarded(
            prompt_template=ARGUMENT_SUBTOPIC_CLASSIFICATION_USER_PROMPT,
            template_kwargs={
                "parent_topic_name": parent_topic_name,
                "classified_arguments": ext_args,
                "subtopics": subtopics,
            },
            system_prompt=ARGUMENT_SUBTOPIC_CLASSIFICATION_SYSTEM_PROMPT,
            output_class=ArgumentClassificationResult,
            model=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.model_name,
            temperature=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.temperature,
            top_p=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.top_p,
            max_tokens=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.max_tokens,
            reasoning_effort=config.ARGUMENT_CLASSIFICATION_BATCH.LLM_PROFILE.reasoning_effort,
        )

        return self._enforce_batch_length(result.results, len(classified_arg_batch))

    def _enforce_batch_length(
        self, items: list[ArgumentClassificationItem], expected_len: int
    ) -> list[ArgumentClassificationItem]:
        """Guarantees the LLM output list strictly matches the input batch length."""
        if len(items) == expected_len:
            return items

        workflow.logger.warning(f"LLM hallucinated list length. Expected {expected_len}, got {len(items)}")
        return [
            ArgumentClassificationItem(
                reasoning="LLM list length mismatch failure. Argument was dropped during inference.",
                idx=-1,
                confidence=0.0,
            )
            for _ in range(expected_len)
        ]
