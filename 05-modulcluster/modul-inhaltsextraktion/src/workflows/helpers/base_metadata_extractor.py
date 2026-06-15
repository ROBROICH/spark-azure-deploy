# src/workflows/helpers/base_metadata_extractor.py
"""
Base metadata extraction helper for SingleDocumentWorkflow.

Handles extraction of base metadata from priority documents using
multi-chunk evidence gathering and LLM consolidation.
"""

import asyncio
import json
from typing import Any

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporal.workflows.inhaltsextraktion.types import BaseMetadata
from temporalio import workflow

from src.config import get_config
from src.env import ENV
from src.workflows.base_metadata.output_format import (
    BaseMetadataWithEvidence,
    LlmConsolidatedMetadata,
)
from src.workflows.base_metadata.prompt import (
    CONSOLIDATE_EVIDENCE_SYSTEM_PROMPT,
    CONSOLIDATE_EVIDENCE_USER_TEMPLATE,
    GATHER_EVIDENCE_SYSTEM_PROMPT,
    GATHER_EVIDENCE_USER_TEMPLATE,
)

# --- Workflow Helper Functions ---


async def consolidate_base_metadata(
    all_evidence: list[dict[str, Any]],
    project_id: str,
) -> BaseMetadata:
    """Consolidate evidence from multiple chunks into final metadata."""
    if not all_evidence:
        return BaseMetadata(application_id=project_id)

    try:
        evidence_json_str = json.dumps(all_evidence, ensure_ascii=False)

        llm_output = await llm_invoke_structured(
            render_prompt_format(CONSOLIDATE_EVIDENCE_USER_TEMPLATE, evidence_list_json=evidence_json_str),
            wrap_system_prompt(CONSOLIDATE_EVIDENCE_SYSTEM_PROMPT),
            LlmConsolidatedMetadata,
            model=ENV.METADATA_MODEL_NAME,
            temperature=0.1,
        )

        consolidated_data = llm_output.model_dump()
        consolidated_data["application_id"] = project_id

        return BaseMetadata(**consolidated_data)
    except Exception:
        return BaseMetadata(application_id=project_id)


# --- Workflow Helper Functions ---


async def extract_base_metadata(
    final_markdown: str,
    project_id: str,
) -> BaseMetadata:
    """
    Extract base metadata from a priority document.

    This function:
    1. Splits markdown into chunks
    2. Gathers evidence from each chunk in parallel (via activities)
    3. Consolidates the evidence into final metadata (via activity)

    Args:
        final_markdown: The markdown content to extract metadata from.
        project_id: The project ID to use as the application_id in the metadata.
    """
    cfg = get_config()
    total_limit = cfg.BASE_METADATA_TOTAL_LIMIT
    chunk_size = cfg.BASE_METADATA_CHUNK_SIZE

    md_content = final_markdown[:total_limit]

    # Gather evidence from chunks
    all_evidence = await _gather_evidence_from_chunks(md_content, chunk_size)

    if not all_evidence:
        workflow.logger.warning("No evidence was gathered from any document chunks.")
        return BaseMetadata(application_id=project_id)

    # Consolidate evidence via activity (avoids json.dumps blocking workflow thread)
    return await consolidate_base_metadata(all_evidence, project_id)


async def _gather_evidence_from_chunks(
    markdown: str,
    chunk_size: int,
) -> list[dict[str, Any]]:
    """
    Gather metadata evidence from document chunks in parallel.
    """
    gather_tasks = []
    for i in range(0, len(markdown), chunk_size):
        content_snippet = markdown[i : i + chunk_size]
        if not content_snippet:
            break

        gather_tasks.append(
            llm_invoke_structured(
                render_prompt_format(GATHER_EVIDENCE_USER_TEMPLATE, markdown_content=content_snippet),
                wrap_system_prompt(GATHER_EVIDENCE_SYSTEM_PROMPT),
                BaseMetadataWithEvidence,
                model=ENV.METADATA_MODEL_NAME,
                temperature=0.1,
            )
        )

    results = await asyncio.gather(*gather_tasks, return_exceptions=True)

    all_evidence = []
    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            workflow.logger.error(f"Failed to extract evidence from chunk {i}: {result}")
        elif result and result.model_dump(exclude_none=True):
            all_evidence.append(result.model_dump())

    return all_evidence
