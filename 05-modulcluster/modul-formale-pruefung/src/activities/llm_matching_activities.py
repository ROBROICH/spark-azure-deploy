"""Temporal activities for the LLM-based document matching workflow.

This module contains the activity definitions used to load configuration data,
generate summaries specifically for classification, and perform the actual
matching of documents against a predefined list of types using an LLM.
"""

from temporalio import workflow

from src.config.config import config
from src.prompts.llm_matching_prompts import (
    DOCUMENT_GROUPING_SYSTEM_PROMPT,
    DOCUMENT_GROUPING_USER_PROMPT,
    DOCUMENT_MATCHING_SYSTEM_PROMPT,
    DOCUMENT_MATCHING_USER_PROMPT,
    DOCUMENT_SUMMARIZATION_SYSTEM_PROMPT,
    DOCUMENT_SUMMARIZATION_USER_PROMPT,
    UNASSIGNED_ANALYSIS_SYSTEM_PROMPT,
    UNASSIGNED_ANALYSIS_USER_PROMPT,
)
from src.schemas.llm_matching_schemas import (
    ClassificationSummaryActivityParams,
    DocumentClassificationMatchResult,
    DocumentGroup,
    DocumentGroupingActivityParams,
    DocumentGroupingResult,
    DocumentMatchingActivityParams,
    DocumentSummaryGenerationResult,
    UnassignedDocumentAnalysisParams,
    UnassignedDocumentReason,
)

from .llm_call import llm_invoke_structured_guarded


def _profile_kwargs() -> dict:
    profile = config.LLM_MATCHING.LLM_PROFILE
    return {
        "model": profile.model_name,
        "temperature": profile.temperature,
        "top_p": profile.top_p,
        "max_completion_tokens": profile.max_completion_tokens,
        "max_prompt_size": profile.llm_max_prompt_size,
        "reasoning_effort": profile.reasoning_effort,
    }


async def llm_classification_summary(
    params: ClassificationSummaryActivityParams,
) -> str:
    """Generates a classification-optimized summary for a document using an LLM.


    Args:
        params: Document details (name, summary, chunk) and LLM profile.

    Returns:
        Summary string optimized for classification.
    """
    res: DocumentSummaryGenerationResult = await llm_invoke_structured_guarded(
        prompt_template=DOCUMENT_SUMMARIZATION_USER_PROMPT,
        system_prompt=DOCUMENT_SUMMARIZATION_SYSTEM_PROMPT,
        output_class=DocumentSummaryGenerationResult,
        template_kwargs={
            "document_name": params.document_name,
            "document_summary": params.document_summary,
            "chunk": params.chunk,
        },
        **_profile_kwargs(),
    )
    return res.summary_for_classification


async def llm_document_grouping(
    params: DocumentGroupingActivityParams,
) -> list[DocumentGroup]:
    """Groups a list of documents logically based on filenames using an LLM.

    Takes a list of unsorted filenames and uses an LLM to identify logical groups.
    Returns a list of DocumentGroup objects referencing input indices. Strictly
    validates that all returned indices fall within input bounds; groups with
    out-of-bound indices are discarded.

    Args:
        params: List of document names and the LLM profile to use.

    Returns:
        Valid identified document groups.
    """
    res: DocumentGroupingResult = await llm_invoke_structured_guarded(
        prompt_template=DOCUMENT_GROUPING_USER_PROMPT,
        system_prompt=DOCUMENT_GROUPING_SYSTEM_PROMPT,
        output_class=DocumentGroupingResult,
        template_kwargs={"document_names": params.document_names},
        **_profile_kwargs(),
    )

    valid_groups = []
    num_docs = len(params.document_names)

    for group in res.groups:
        if not (0 <= group.representative_index < num_docs):
            workflow.logger.warning(
                f"Grouping hallucination: Representative index {group.representative_index} "
                f"is out of bounds (0-{num_docs - 1}). Discarding group '{group.group_name}'."
            )
            continue

        invalid_indices = [idx for idx in group.document_indices if not (0 <= idx < num_docs)]
        if invalid_indices:
            workflow.logger.warning(
                f"Grouping hallucination: Document indices {invalid_indices} "
                f"are out of bounds (0-{num_docs - 1}). Discarding group '{group.group_name}'."
            )
            continue

        valid_groups.append(group)

    return valid_groups


async def llm_match_document_to_list(
    params: DocumentMatchingActivityParams,
) -> DocumentClassificationMatchResult:
    """Identifies the best matching document type from a candidate list using an LLM.

    Presents the LLM with the document's classification summary and a list of
    candidate document types. Returns a structured result containing the best match
    index, reasoning, and confidence. If the returned ``match_index`` is out of
    bounds, it is reset to -1.

    Args:
        params: Document info, candidate list objects.

    Returns:
        The complete matching result object.
    """
    res: DocumentClassificationMatchResult = await llm_invoke_structured_guarded(
        prompt_template=DOCUMENT_MATCHING_USER_PROMPT,
        system_prompt=DOCUMENT_MATCHING_SYSTEM_PROMPT,
        output_class=DocumentClassificationMatchResult,
        template_kwargs={
            "document_name": params.document_name,
            "document_summary": params.document_summary,
            "document_group": params.document_group,
            "candidates": params.candidate_list,
        },
        **_profile_kwargs(),
    )

    if res.match_index < 0 or res.match_index >= len(params.candidate_list):
        if res.match_index != -1:
            workflow.logger.warning(
                f"Matching hallucination: Index {res.match_index} is out of bounds "
                f"(0-{len(params.candidate_list) - 1}). Resetting to -1."
            )
        res.match_index = -1

    return res


async def llm_analyze_unassigned_document(
    params: UnassignedDocumentAnalysisParams,
) -> UnassignedDocumentReason:
    """Analyzes why a document remains unassigned after classification attempts.

    Args:
        params: Document details and rejection strings from matching attempts.

    Returns:
        Synthesized reason for the unassigned status.
    """
    return await llm_invoke_structured_guarded(
        prompt_template=UNASSIGNED_ANALYSIS_USER_PROMPT,
        system_prompt=UNASSIGNED_ANALYSIS_SYSTEM_PROMPT,
        output_class=UnassignedDocumentReason,
        template_kwargs={
            "document_name": params.document_name,
            "document_summary": params.document_summary,
            "reasoning_history": params.reasoning_history,
        },
        **_profile_kwargs(),
    )
