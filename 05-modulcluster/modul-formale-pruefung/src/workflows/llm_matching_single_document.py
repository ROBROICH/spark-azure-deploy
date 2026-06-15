from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.dms_activities import get_inhalts_extraktion_doc_chunks
from src.activities.llm_matching_activities import (
    llm_analyze_unassigned_document,
    llm_classification_summary,
    llm_match_document_to_list,
)
from src.config.config import config
from src.schemas.dms_schemas import InhaltsExtraktionChunksActivityParams
from src.schemas.llm_matching_schemas import (
    ClassificationSummaryActivityParams,
    DocumentClassificationMatchResult,
    DocumentMatchingActivityParams,
    SingleDocumentMatchInput,
    SingleDocumentMatchOutput,
    UnassignedDocumentAnalysisParams,
)
from src.utils.sliding_window import sliding_window

LLM_MATCHING_SINGLE_DOCUMENT_WORKFLOW_ID = "llm-matching-single-document"


@workflow.defn(name=LLM_MATCHING_SINGLE_DOCUMENT_WORKFLOW_ID)
class LLMMatchingSingleDocumentWorkflow:
    """Child workflow that matches a single document against candidate document types.

    Handles the full per-document lifecycle:
    1. Fetch content extraction and generate classification summary
    2. Match against candidate batches (sliding window)
    3. Refine if multiple batches match
    4. Analyse unassigned if no match found
    """

    @workflow.run
    async def run(self, inp: SingleDocumentMatchInput) -> SingleDocumentMatchOutput:
        # 1. Retrieve content and generate classification summary
        inhalts_extraction = await workflow.execute_activity(
            get_inhalts_extraktion_doc_chunks,
            InhaltsExtraktionChunksActivityParams(
                dms_document=inp.dms_doc,
                n_pages=config.LLM_MATCHING.N_PAGE_SUMMARY,
                include_summary=True,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
        )

        classification_summary = await llm_classification_summary(
            ClassificationSummaryActivityParams(
                document_name=inp.dms_doc.document_name,
                document_summary=inhalts_extraction.summary or "",
                chunk="\n".join([chunk.page_content for chunk in inhalts_extraction.chunks]),
            )
        )

        # 2. Batch-match against candidates
        step = config.LLM_MATCHING.MAX_ELEMENTS_IN_CONTEXT
        batches = [inp.candidates[i : i + step] for i in range(0, len(inp.candidates), step)]

        async def match_batch(idx: int) -> tuple[int, DocumentClassificationMatchResult]:
            return idx, await llm_match_document_to_list(
                DocumentMatchingActivityParams(
                    document_name=inp.dms_doc.document_name,
                    document_summary=classification_summary,
                    document_group=inp.document_group,
                    candidate_list=batches[idx],
                )
            )

        indexed = await sliding_window(
            list(range(len(batches))),
            match_batch,
            concurrency=config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES,
        )
        batch_results: list[DocumentClassificationMatchResult] = [r for _, r in sorted(indexed)]

        # 3. Evaluate results
        collected_reasoning: list[str] = [f"Batch check: {e.reasoning}" for e in batch_results]
        potential_matches = [
            (batches[i][res.match_index], res) for i, res in enumerate(batch_results) if res.match_index != -1
        ]

        if potential_matches:
            if len(potential_matches) == 1:
                candidate, result = potential_matches[0]
                return SingleDocumentMatchOutput(
                    assigned_document_type=candidate,
                    reasoning=result.reasoning,
                    confidence=result.confidence,
                )

            # Refinement: multiple batches matched
            workflow.logger.info(
                f"Document '{inp.dms_doc.document_name}' has "
                f"{len(potential_matches)} potential matches. Running refinement."
            )
            shortlist = [pm[0] for pm in potential_matches]
            refinement_res = await llm_match_document_to_list(
                DocumentMatchingActivityParams(
                    document_name=inp.dms_doc.document_name,
                    document_summary=classification_summary,
                    document_group=inp.document_group,
                    candidate_list=shortlist,
                )
            )
            collected_reasoning.append(f"Refinement check: {refinement_res.reasoning}")
            if refinement_res.match_index != -1:
                return SingleDocumentMatchOutput(
                    assigned_document_type=shortlist[refinement_res.match_index],
                    reasoning=refinement_res.reasoning,
                    confidence=refinement_res.confidence,
                )

        # 4. No match — unassigned analysis
        unassigned_response = await llm_analyze_unassigned_document(
            UnassignedDocumentAnalysisParams(
                document_name=inp.dms_doc.document_name,
                document_summary=classification_summary,
                reasoning_history=collected_reasoning,
            )
        )

        return SingleDocumentMatchOutput(
            assigned_document_type=None,
            reasoning=unassigned_response.reasoning,
            confidence=unassigned_response.confidence,
        )
