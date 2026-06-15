"""Workflow for the automated extraction and grounding of arguments in legal objections (Einwendungen).

This module defines the Temporal workflow that orchestrates the extraction pipeline,
including raw LLM processing, context enrichment for fragmented arguments, and
precise character-level grounding within source documents.
"""

from datetime import timedelta
from uuid import UUID

from prompt_injection.prompt_defense import sanitize_html
from temporal.utils import sliding_window
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentExtractionOutput,
    ArgumentExtractionParams,
    ChunkArguments,
    ChunkEWMS,
    DocumentArguments,
    ExtractedArgument,
    Segment,
    SingleDocumentEWMSWorkflowOutput,
    TextSpan,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.argument_extraction_activities import span_positions
from src.activities.llm_call import llm_invoke_structured_guarded
from src.config.config import config
from src.prompts.argument_extraction_prompt import (
    ARGUMENT_EXTRACTION_SYSTEM_PROMPT,
    ARGUMENT_EXTRACTION_USER_PROMPT,
    RESIDUAL_CONTEXT_ASSIGNMENT_SYSTEM_PROMPT,
    RESIDUAL_CONTEXT_ASSIGNMENT_USER_PROMPT,
)
from src.schemas.argument_extraction_schemas import (
    ArgumentExtractionLLMResult,
    MultiArgumentsExtractionLLMResult,
    ResidualContextAssignmentItem,
    ResidualContextAssignmentResult,
    SpanPositionRequest,
    SpanPositionsActivityParams,
)


@workflow.defn
class ArgumentExtractionSingleBatchWorkflow:
    """Temporal Workflow for orchestrating legal objection extraction and grounding for a single batch of documents.

    This workflow manages the end-to-end lifecycle of legal objection processing,
    from fetching document data to extracting, grounding, and validating arguments.
    """

    @workflow.run
    async def run(self, params: ArgumentExtractionParams) -> ArgumentExtractionOutput:
        """Executes the main argument extraction workflow.

        Fetches project data, extracts arguments, resolves overlaps, applies context,
        and ensures the final output preserves the original document hierarchy.
        """
        document_arguments = await self._get_full_arguments(params.processed_files_output)
        document_arguments = await self._resolve_overlaps_sort_arguments(document_arguments)
        document_arguments = await self._apply_residual_chunk_context(document_arguments)
        document_arguments = self._assemble_order_arguments(params.processed_files_output, document_arguments)
        document_arguments = self._sanitize_segments(document_arguments)
        output = ArgumentExtractionOutput(document_arguments=document_arguments)
        return output

    async def _get_full_arguments(
        self, processed_files_output: list[SingleDocumentEWMSWorkflowOutput]
    ) -> list[DocumentArguments]:
        """Coordinates the argument extraction, context resolution, and grounding phases.

        Processes raw documents through LLM extraction, expands fragmented context,
        grounds text to spans, and assembles the results.
        """
        argument_items = await self._process_argument_extraction(processed_files_output)
        grounded_items = await self._process_grounding(argument_items)
        assembled_items = self._assemble_arguments(grounded_items)

        return assembled_items

    async def _process_argument_extraction(
        self, processed_files_output: list[SingleDocumentEWMSWorkflowOutput]
    ) -> list[tuple[str, ChunkEWMS, ArgumentExtractionLLMResult]]:
        """Executes LLM argument extraction concurrently across all chunks.

        Flattens the document-chunk hierarchy and uses a sliding window to process
        extraction requests in parallel.
        """
        flat_records: list[tuple[str, ChunkEWMS]] = []
        for doc in processed_files_output:
            for chunk in doc.chunks:
                flat_records.append((doc.original_file_id, chunk))

        async def argument_extraction_worker(idx: int) -> tuple[int, list[ArgumentExtractionLLMResult]]:
            _, chunk = flat_records[idx]
            res = await self._extract_agruments_from_chunk(chunk)
            return idx, res

        argument_extraction_indexed = await sliding_window(
            list(range(len(flat_records))),
            argument_extraction_worker,
            concurrency=config.TEMPORAL.MAX_ASYNC_CONCURRENT_ACTIVITIES,
        )

        argument_items = []
        for i, llm_results in sorted(argument_extraction_indexed):
            document_id, chunk = flat_records[i]
            for llm_res in llm_results:
                argument_items.append((document_id, chunk, llm_res))

        return argument_items

    async def _process_grounding(
        self,
        argument_items: list[tuple[str, ChunkEWMS, ArgumentExtractionLLMResult]],
    ) -> list[tuple[str, ChunkEWMS, ArgumentExtractionLLMResult, TextSpan, TextSpan]]:
        """Maps argument and context strings to exact character offsets within the chunk.

        Attempts to ground the argument snippet first. If successful and the snippet
        has a context, it attempts to ground the broader context string.
        """
        span_results = await self._ground_text_batch(argument_items)

        grounded_items = []

        for item, (argument_span, extracted_context_span) in zip(argument_items, span_results, strict=True):
            _, chunk, llm_res = item

            if argument_span.start_idx == -1:
                workflow.logger.warning(
                    f"Grounding failed for span text: '{llm_res.argument[:30]}...'"
                    f"\n\nfull text: {chunk.page_content[:30]}..."
                )
                continue

            context_span = argument_span
            if extracted_context_span is not None:
                if (
                    extracted_context_span.start_idx != -1
                    and extracted_context_span.start_idx <= argument_span.start_idx
                    and argument_span.end_idx <= extracted_context_span.end_idx
                ):
                    context_span = extracted_context_span

            grounded_items.append((*item, argument_span, context_span))

        return grounded_items

    async def _ground_text_batch(
        self,
        context_items: list[tuple[str, ChunkEWMS, ArgumentExtractionLLMResult]],
    ) -> list[tuple[TextSpan, TextSpan | None]]:
        """Executes fuzzy grounding and maps results strictly back to their input pairs."""
        requests: list[SpanPositionRequest] = []
        mapping: list[tuple[int, int | None]] = []

        for _, chunk, llm_res in context_items:
            arg_idx = len(requests)
            requests.append(SpanPositionRequest(span_text=llm_res.argument, full_text=chunk.page_content))

            ctx_idx = None
            if llm_res.context:
                ctx_idx = len(requests)
                requests.append(SpanPositionRequest(span_text=llm_res.context, full_text=chunk.page_content))

            mapping.append((arg_idx, ctx_idx))

        if not requests:
            return []

        batch_size = config.ARGUMENT_EXTRACTION_BATCH.SPAN_POSITIONS_BATCH_SIZE
        request_batches = [requests[i : i + batch_size] for i in range(0, len(requests), batch_size)]

        async def worker(batch_idx: int) -> tuple[int, list[TextSpan]]:
            batch_items = request_batches[batch_idx]
            res = await workflow.execute_activity(
                span_positions,
                SpanPositionsActivityParams(
                    items=batch_items,
                    threshold=config.ARGUMENT_EXTRACTION_BATCH.FUZZY_ALIGNMENT_THRESHOLD,
                ),
                start_to_close_timeout=timedelta(seconds=config.ARGUMENT_EXTRACTION_BATCH.SPAN_POSITIONS_TIMEOUT),
                retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
            )
            return batch_idx, res

        indexed_results = await sliding_window(
            list(range(len(request_batches))),
            fn=worker,
            concurrency=config.TEMPORAL.MAX_SYNC_CONCURRENT_ACTIVITIES,
        )

        sorted_batches = [res for _, res in sorted(indexed_results)]
        flat_spans = [span for batch in sorted_batches for span in batch]

        structured_results: list[tuple[TextSpan, TextSpan | None]] = []
        for arg_idx, ctx_idx in mapping:
            arg_span = flat_spans[arg_idx]
            ctx_span = flat_spans[ctx_idx] if ctx_idx is not None else None
            structured_results.append((arg_span, ctx_span))

        return structured_results

    def _assemble_arguments(
        self,
        grounded_items: list[tuple[str, ChunkEWMS, ArgumentExtractionLLMResult, TextSpan, TextSpan]],
    ) -> list[DocumentArguments]:
        """Reconstructs the flat grounded results into the Document/Chunk hierarchy."""
        assembly: dict[str, dict[UUID, tuple[ChunkEWMS, list[ExtractedArgument]]]] = {}

        for document_id, chunk, llm_res, argument_span, context_span in grounded_items:
            chunk_id = chunk.chunk_id

            if document_id not in assembly:
                assembly[document_id] = {}
            if chunk_id not in assembly[document_id]:
                assembly[document_id][chunk_id] = (chunk, [])

            assembly[document_id][chunk_id][1].append(
                ExtractedArgument(
                    argument=Segment(
                        text=chunk.page_content[argument_span.start_idx : argument_span.end_idx], span=argument_span
                    ),
                    description=llm_res.description,
                    context=Segment(
                        text=chunk.page_content[context_span.start_idx : context_span.end_idx], span=context_span
                    ),
                )
            )

        final_document_arguments = []
        for doc_id, chunks_map in assembly.items():
            doc_exts = DocumentArguments(
                document_id=doc_id,
                chunk_arguments=[
                    ChunkArguments(chunk=chunk_obj, arguments=exts) for chunk_obj, exts in chunks_map.values()
                ],
            )
            final_document_arguments.append(doc_exts)

        return final_document_arguments

    async def _extract_agruments_from_chunk(self, chunk: ChunkEWMS) -> list[ArgumentExtractionLLMResult]:
        """Invokes the LLM to identify and extract arguments from a text chunk."""
        res: MultiArgumentsExtractionLLMResult = await llm_invoke_structured_guarded(
            prompt_template=ARGUMENT_EXTRACTION_USER_PROMPT,
            template_kwargs={"chunk_text": chunk.page_content},
            system_prompt=ARGUMENT_EXTRACTION_SYSTEM_PROMPT,
            output_class=MultiArgumentsExtractionLLMResult,
            model=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.model_name,
            temperature=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.temperature,
            top_p=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.top_p,
            max_tokens=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.max_tokens,
            reasoning_effort=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.reasoning_effort,
        )
        return res.extracted_arguments

    async def _resolve_overlaps_sort_arguments(
        self, document_arguments: list[DocumentArguments]
    ) -> list[DocumentArguments]:
        """Resolves overlapping argument boundaries within document chunks and sort them.

        Calls a dedicated activity to filter out overlaps and sorts the remaining
        arguments chronologically by their text offsets.
        """
        resolved_docs: list[DocumentArguments] = []

        for doc in document_arguments:
            resolved_chunks: list[ChunkArguments] = []

            for chunk_args in doc.chunk_arguments:
                # 1. Prepare valid candidates
                valid_candidates: list[int] = []
                for i, arg_ext in enumerate(chunk_args.arguments):
                    span = arg_ext.argument.span
                    if not span or span.start_idx == -1:
                        continue
                    valid_candidates.append(i)

                # 2. Sort by end_idx for greedy earliest-finish-time algorithm
                valid_candidates.sort(key=lambda idx: chunk_args.arguments[idx].argument.span.end_idx)

                # 3. Resolve overlaps
                selected_indices: list[int] = []
                last_end_pos = -1

                for idx in valid_candidates:
                    span = chunk_args.arguments[idx].argument.span
                    if span.start_idx >= last_end_pos:
                        selected_indices.append(idx)
                        last_end_pos = span.end_idx
                    else:
                        workflow.logger.warning(
                            f"Overlap detected in document {doc.document_id}. "
                            f"Skipping argument at index {idx} (Span: {span.start_idx}-{span.end_idx}) "
                            f"as it overlaps with previous end position {last_end_pos}."
                        )

                # 4. Sort selected arguments chronologically by start_idx
                selected_indices.sort(key=lambda idx: chunk_args.arguments[idx].argument.span.start_idx)

                resolved_arguments = [chunk_args.arguments[i] for i in selected_indices]
                resolved_chunks.append(ChunkArguments(chunk=chunk_args.chunk, arguments=resolved_arguments))

            resolved_docs.append(
                DocumentArguments(
                    document_id=doc.document_id,
                    chunk_arguments=resolved_chunks,
                )
            )

        return resolved_docs

    async def _apply_residual_chunk_context(
        self, document_arguments: list[DocumentArguments]
    ) -> list[DocumentArguments]:
        """Assigns non-extracted textual gaps (sandwiches) to neighboring arguments in batches.

        Orchestrates LLM evaluation of residual text between valid arguments per chunk
        to ensure no chunk content is orphaned. Modifies the documents in-place.
        """
        # 1. Prepare margins and identify batches of residual tasks per chunk
        inference_batches = self._prepare_sandwiches_and_margins(document_arguments)

        # 2. Evaluate batches concurrently if there are any gaps to fill
        if inference_batches:
            batch_decisions = await self._evaluate_sandwich_batches(inference_batches)

            # 3. Apply the decisions to mutate the arguments directly in their chunks
            self._apply_sandwich_decisions(inference_batches, batch_decisions)

        return document_arguments

    def _prepare_sandwiches_and_margins(
        self, document_arguments: list[DocumentArguments]
    ) -> list[tuple[ChunkArguments, list[tuple[int, int, str]]]]:
        """Identifies text gaps between arguments per chunk and prepends/appends margins."""
        inference_batches: list[tuple[ChunkArguments, list[tuple[int, int, str]]]] = []

        for doc in document_arguments:
            for chunk_args in doc.chunk_arguments:
                chunk_text = chunk_args.chunk.page_content
                sandwich_tasks: list[tuple[int, int, str]] = []

                if not chunk_args.arguments:
                    continue

                for i, arg in enumerate(chunk_args.arguments):
                    current_span = arg.argument.span

                    # --- Margin Logic (Prefix & Suffix) ---
                    if i == 0 and current_span.start_idx > 0:
                        prefix_text = chunk_text[: current_span.start_idx]
                        arg.context = Segment(
                            text=prefix_text + (arg.context.text if arg.context else arg.argument.text),
                            span=TextSpan(
                                start_idx=0,
                                end_idx=arg.context.span.end_idx if arg.context else arg.argument.span.end_idx,
                            ),
                        )

                    if i == len(chunk_args.arguments) - 1 and current_span.end_idx < len(chunk_text):
                        suffix_text = chunk_text[current_span.end_idx :]
                        arg.context = Segment(
                            text=(arg.context.text if arg.context else arg.argument.text) + suffix_text,
                            span=TextSpan(
                                start_idx=arg.context.span.start_idx if arg.context else arg.argument.span.start_idx,
                                end_idx=len(chunk_text),
                            ),
                        )

                    if i < len(chunk_args.arguments) - 1:
                        next_arg = chunk_args.arguments[i + 1]
                        next_span = next_arg.argument.span

                        if current_span.end_idx < next_span.start_idx:
                            residual_text = chunk_text[current_span.end_idx : next_span.start_idx]
                            sandwich_tasks.append((i, i + 1, residual_text))

                if sandwich_tasks:
                    inference_batches.append((chunk_args, sandwich_tasks))

        return inference_batches

    async def _evaluate_sandwich_batches(
        self, inference_batches: list[tuple[ChunkArguments, list[tuple[int, int, str]]]]
    ) -> list[list[int]]:
        """Uses LLM to decide which neighboring argument owns the textual gaps per chunk."""

        async def worker(idx: int) -> tuple[int, list[int]]:
            chunk_args, tasks = inference_batches[idx]

            # Pack the tasks for the Jinja template
            template_data = []
            for left_idx, right_idx, residual in tasks:
                template_data.append(
                    {
                        "argument_0": chunk_args.arguments[left_idx],
                        "argument_1": chunk_args.arguments[right_idx],
                        "residual_text": residual,
                    }
                )

            res: ResidualContextAssignmentResult = await llm_invoke_structured_guarded(
                prompt_template=RESIDUAL_CONTEXT_ASSIGNMENT_USER_PROMPT,
                template_kwargs={"residual_batch": template_data},
                system_prompt=RESIDUAL_CONTEXT_ASSIGNMENT_SYSTEM_PROMPT,
                output_class=ResidualContextAssignmentResult,
                model=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.model_name,
                temperature=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.temperature,
                top_p=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.top_p,
                max_tokens=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.max_tokens,
                reasoning_effort=config.ARGUMENT_EXTRACTION_BATCH.LLM_PROFILE.reasoning_effort,
            )

            decisions = self._enforce_residual_batch_length(res.results, len(tasks))
            return idx, decisions

        indexed_results = await sliding_window(
            list(range(len(inference_batches))),
            fn=worker,
            concurrency=config.TEMPORAL.MAX_ASYNC_CONCURRENT_ACTIVITIES,
        )

        return [res for _, res in sorted(indexed_results)]

    def _enforce_residual_batch_length(
        self, items: list[ResidualContextAssignmentItem], expected_len: int
    ) -> list[int]:
        """Guarantees the LLM output list strictly matches the input batch length."""
        if len(items) == expected_len:
            return [item.assigned_idx for item in items]

        workflow.logger.warning(
            f"LLM hallucinated list length for residual context assignment. Expected {expected_len}, got {len(items)}"
        )

        # Fallback safety measure: Assign all orphaned gaps to the preceding argument (0)
        return [0 for _ in range(expected_len)]

    def _apply_sandwich_decisions(
        self,
        inference_batches: list[tuple[ChunkArguments, list[tuple[int, int, str]]]],
        batch_decisions: list[list[int]],
    ) -> None:
        """Appends or prepends gap text directly to the context of the assigned argument in-place."""
        for (chunk_args, tasks), decisions in zip(inference_batches, batch_decisions, strict=True):
            for task, assigned_side in zip(tasks, decisions, strict=True):
                left_idx, right_idx, residual = task

                if assigned_side == 0:
                    arg = chunk_args.arguments[left_idx]
                    current_context_text = arg.context.text if arg.context else arg.argument.text
                    current_start = arg.context.span.start_idx if arg.context else arg.argument.span.start_idx

                    arg.context = Segment(
                        text=current_context_text + residual,
                        span=TextSpan(start_idx=current_start, end_idx=arg.argument.span.end_idx + len(residual)),
                    )
                else:
                    arg = chunk_args.arguments[right_idx]
                    current_context_text = arg.context.text if arg.context else arg.argument.text
                    current_end = arg.context.span.end_idx if arg.context else arg.argument.span.end_idx

                    arg.context = Segment(
                        text=residual + current_context_text,
                        span=TextSpan(start_idx=arg.argument.span.start_idx - len(residual), end_idx=current_end),
                    )

    def _assemble_order_arguments(
        self,
        processed_files_output: list[SingleDocumentEWMSWorkflowOutput],
        document_arguments: list[DocumentArguments],
    ) -> list[DocumentArguments]:
        """Aligns extracted arguments with the original input data structure.

        Ensures that documents or chunks missing from the extraction process are
        represented by empty arrays, preserving sequence and completeness.
        """
        doc_arguments_map = {
            single_document_arguments.document_id: single_document_arguments
            for single_document_arguments in document_arguments
        }

        full_document_arguments = []
        for processed_file_output in processed_files_output:
            if processed_file_output.original_file_id in doc_arguments_map:
                single_document_arguments = doc_arguments_map[processed_file_output.original_file_id]
                full_chunk_arguments = []
                chunk_args_map = {
                    single_chunk_arguments.chunk.chunk_id: single_chunk_arguments
                    for single_chunk_arguments in single_document_arguments.chunk_arguments
                }
                for chunk in processed_file_output.chunks:
                    if chunk.chunk_id in chunk_args_map:
                        full_chunk_arguments.append(chunk_args_map[chunk.chunk_id])
                    else:
                        full_chunk_arguments.append(ChunkArguments(chunk=chunk, arguments=[]))

                full_document_arguments.append(
                    DocumentArguments(
                        document_id=processed_file_output.original_file_id,
                        chunk_arguments=full_chunk_arguments,
                    )
                )
            else:
                full_document_arguments.append(
                    DocumentArguments(
                        document_id=processed_file_output.original_file_id,
                        chunk_arguments=[
                            ChunkArguments(chunk=chunk, arguments=[]) for chunk in processed_file_output.chunks
                        ],
                    )
                )
        return full_document_arguments

    def _sanitize_segments(self, document_arguments: list[DocumentArguments]) -> list[DocumentArguments]:
        for doc in document_arguments:
            for chunk_args in doc.chunk_arguments:
                for arg in chunk_args.arguments:
                    arg.argument = Segment(text=sanitize_html(arg.argument.text), span=arg.argument.span)
                    if arg.context:
                        arg.context = Segment(text=sanitize_html(arg.context.text), span=arg.context.span)
        return document_arguments
