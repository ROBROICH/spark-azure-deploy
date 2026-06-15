"""Defines Temporal Activities for the Table of Contents (TOC) extraction workflow.

This module contains the activity definitions required by the
`InhaltsverzeichnisFinderWorkflow`. These activities handle the orchestration
of external services, including:
1.  **Data Fetching:** Retrieving document metadata and text chunks from the
    Inhaltsextraktion API.
2.  **LLM Classification:** Using an OpenAI-compatible LLM to classify text chunks
    as potential TOCs, verify them against document context, and determine if
    subsequent chunks are logical continuations.

The activities bridge the gap between the Temporal workflow engine and the
domain-specific logic for document analysis.
"""

from temporalio import workflow

from src.config.config import config
from src.prompts.inhaltsverzeichnis_finder_prompts import (
    DOCUMENT_TYPE_DESCRIPTION_GENERATION_SYSTEM_PROMPT,
    DOCUMENT_TYPE_DESCRIPTION_GENERATION_USER_PROMPT,
    FILENAME_SELECTION_SYSTEM_PROMPT,
    FILENAME_SELECTION_USER_PROMPT,
    INHALTSVERZEICHNIS_CHUNK_CLASSIFICATION_SYSTEM_PROMPT,
    INHALTSVERZEICHNIS_CHUNK_CLASSIFICATION_USER_PROMPT,
    INHALTSVERZEICHNIS_CONNECTED_CHUNK_CLASSIFICATION_SYSTEM_PROMPT,
    INHALTSVERZEICHNIS_CONNECTED_CHUNK_CLASSIFICATION_USER_PROMPT,
    INHALTSVERZEICHNIS_OVERALL_CLASSIFICATION_SYSTEM_PROMPT,
    INHALTSVERZEICHNIS_OVERALL_CLASSIFICATION_USER_PROMPT,
    INHALTSVERZEICHNIS_PARSER_SYSTEM_PROMPT,
    INHALTSVERZEICHNIS_PARSER_USER_PROMPT,
)
from src.schemas.inhaltsverzeichnis_finder_schemas import (
    ChunkLLMClassificationActivityParams,
    ConnectedChunkLLMClassificationActivityParams,
    DocumentTypeDescriptionGenerationActivityInput,
    DocumentTypeDescriptionResult,
    FileNameClassificationResult,
    InhaltsverzeichnisClassificationResult,
    InhaltsverzeichnisConnectedChunksClassificationResult,
    InhaltsverzeichnisParsedResult,
    InhaltsverzeichnisParserActivityInput,
    OverallLLMClassificationActivityParams,
    SelectInhaltsverzeichnisLLMActivityParams,
)

from .llm_call import llm_invoke_structured_guarded


def _profile_kwargs() -> dict:
    profile = config.INHALTSVERZEICHNIS_FINDER.LLM_PROFILE
    return {
        "model": profile.model_name,
        "temperature": profile.temperature,
        "top_p": profile.top_p,
        "max_completion_tokens": profile.max_completion_tokens,
        "max_prompt_size": profile.llm_max_prompt_size,
        "reasoning_effort": profile.reasoning_effort,
    }


async def llm_chunk_classification(
    params: ChunkLLMClassificationActivityParams,
) -> InhaltsverzeichnisClassificationResult:
    """Classifies a text chunk to determine if it represents a Table of Contents.

    Args:
        params: Parameters containing the chunk text.

    Returns:
        Classification result indicating whether the chunk is a global TOC.
    """
    workflow.logger.debug(f"Starting basic LLM classification for chunk (len={len(params.chunk)})")

    res: InhaltsverzeichnisClassificationResult = await llm_invoke_structured_guarded(
        prompt_template=INHALTSVERZEICHNIS_CHUNK_CLASSIFICATION_USER_PROMPT,
        system_prompt=INHALTSVERZEICHNIS_CHUNK_CLASSIFICATION_SYSTEM_PROMPT,
        output_class=InhaltsverzeichnisClassificationResult,
        template_kwargs={"chunk": params.chunk},
        **_profile_kwargs(),
    )

    workflow.logger.debug(f"Basic classification result: {res.is_global_inhalts_verzeichnis}")
    return res


async def llm_overall_classification(
    params: OverallLLMClassificationActivityParams,
) -> InhaltsverzeichnisClassificationResult:
    """Classifies a chunk using document context (name and summary).

    Performs a more context-aware classification to determine if the chunk
    serves as the global Table of Contents for the specific document.

    Args:
        params: Chunk text, document name, and summary.

    Returns:
        Classification result indicating whether the chunk is a global TOC.
    """
    workflow.logger.debug(f"Starting overall (context-aware) classification for document: '{params.document_name}'")

    res: InhaltsverzeichnisClassificationResult = await llm_invoke_structured_guarded(
        prompt_template=INHALTSVERZEICHNIS_OVERALL_CLASSIFICATION_USER_PROMPT,
        system_prompt=INHALTSVERZEICHNIS_OVERALL_CLASSIFICATION_SYSTEM_PROMPT,
        output_class=InhaltsverzeichnisClassificationResult,
        template_kwargs={
            "document_name": params.document_name,
            "document_summary": params.document_summary,
            "chunk": params.chunk,
        },
        **_profile_kwargs(),
    )

    workflow.logger.debug(
        f"Overall classification result for '{params.document_name}': {res.is_global_inhalts_verzeichnis}"
    )
    return res


async def llm_select_global_inhaltsverzeichnis_document_name(
    params: SelectInhaltsverzeichnisLLMActivityParams,
) -> int | None:
    """Analyzes a list of filenames to identify the most likely global Master Index.

    Args:
        params: List of filenames to evaluate.

    Returns:
        The 0-based index of the chosen file, or None if no suitable candidate is found.
    """
    workflow.logger.debug(f"Starting file name selection. Candidates: {len(params.document_names)}")

    formatted_file_list = "\n".join(f"[{i}] {name}" for i, name in enumerate(params.document_names))

    res: FileNameClassificationResult = await llm_invoke_structured_guarded(
        prompt_template=FILENAME_SELECTION_USER_PROMPT,
        system_prompt=FILENAME_SELECTION_SYSTEM_PROMPT,
        output_class=FileNameClassificationResult,
        template_kwargs={"file_names_list": formatted_file_list},
        **_profile_kwargs(),
    )

    chosen_index = res.chosen_file_index
    workflow.logger.debug(f"LLM selected index: '{chosen_index}'")

    if chosen_index == -1:
        return None

    if chosen_index < 0 or chosen_index >= len(params.document_names):
        workflow.logger.warning(
            f"LLM returned an invalid index ({chosen_index}) for a list of size {len(params.document_names)}"
        )
        return None

    workflow.logger.debug(f"Selected index {chosen_index} corresponds to '{params.document_names[chosen_index]}'")
    return chosen_index


async def llm_connected_chunk_classification(
    params: ConnectedChunkLLMClassificationActivityParams,
) -> bool:
    """Determines if two text chunks are sequentially connected.

    Evaluates whether the second chunk is a logical continuation of the first,
    typically used to identify Table of Contents spanning multiple pages.

    Args:
        params: First and second text chunks.

    Returns:
        True if the chunks are determined to be connected, False otherwise.
    """
    workflow.logger.debug(
        f"Checking connection between chunks. "
        f"Chunk 1 len: {len(params.first_chunk)}, Chunk 2 len: {len(params.second_chunk)}"
    )

    res: InhaltsverzeichnisConnectedChunksClassificationResult = await llm_invoke_structured_guarded(
        prompt_template=INHALTSVERZEICHNIS_CONNECTED_CHUNK_CLASSIFICATION_USER_PROMPT,
        system_prompt=INHALTSVERZEICHNIS_CONNECTED_CHUNK_CLASSIFICATION_SYSTEM_PROMPT,
        output_class=InhaltsverzeichnisConnectedChunksClassificationResult,
        template_kwargs={
            "first_chunk": params.first_chunk,
            "second_chunk": params.second_chunk,
        },
        **_profile_kwargs(),
    )

    workflow.logger.debug(f"Chunks connected status: {res.are_connected_chunks}")
    return res.are_connected_chunks


async def llm_inhaltsverzeichnis_parser(
    params: InhaltsverzeichnisParserActivityInput,
) -> InhaltsverzeichnisParsedResult:
    """Parses extracted table-of-contents chunks into a structured TOC object using an LLM.

    Consolidates a list of text chunks representing a document's Table of Contents
    into a single text block, then invokes an LLM to extract the lowest-level
    elements (leaf nodes) into a structured format, preserving their hierarchical
    context.

    Args:
        params: Chunk list with `page_content` attributes representing the raw TOC text.

    Returns:
        Structured TOC entries with title, hierarchy path, and optional numbering.
    """
    full_text = "\n\n".join(chunk.page_content for chunk in params.chunk_list)
    kwargs = _profile_kwargs()
    kwargs["max_completion_tokens"] = config.INHALTSVERZEICHNIS_FINDER.IV_PARSER_MAX_TOKEN
    return await llm_invoke_structured_guarded(
        prompt_template=INHALTSVERZEICHNIS_PARSER_USER_PROMPT,
        system_prompt=INHALTSVERZEICHNIS_PARSER_SYSTEM_PROMPT,
        output_class=InhaltsverzeichnisParsedResult,
        template_kwargs={"iv_str": full_text},
        **kwargs,
    )


async def llm_document_type_description_generation(
    params: DocumentTypeDescriptionGenerationActivityInput,
) -> DocumentTypeDescriptionResult:
    """
    Call the LLM to generate a short contextual explanation for a chapter
    or subchapter based on the given GIV fields and project metadata.
    If `subchapter_id` is set, the subchapter template is used, otherwise the chapter template is used.
    """
    return await llm_invoke_structured_guarded(
        prompt_template=DOCUMENT_TYPE_DESCRIPTION_GENERATION_USER_PROMPT,
        system_prompt=DOCUMENT_TYPE_DESCRIPTION_GENERATION_SYSTEM_PROMPT,
        output_class=DocumentTypeDescriptionResult,
        template_kwargs={
            "entry_title": params.entry_title,
            "entry_number": params.entry_number,
            "hierarchy_path": " > ".join(params.hierarchy_path) if params.hierarchy_path else "None",
            "document_definitions": params.document_types,
        },
        **_profile_kwargs(),
    )
