# src/activities/vlm_processing.py
"""
Activities for VLM (Visual Language Model) processing of visual elements.

This module contains higher-level VLM processing activities:
- Applying VLM results to markdown content

For core VLM API invocation, see vlm_invoke.py
"""

import asyncio
import re
from datetime import timedelta

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import llm_invoke_structured
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.env import ENV
from src.workflows.vlm_enhancement.output_format import (
    VlmAnalysis,
    VLMWorkflowOutput,
)
from src.workflows.vlm_enhancement.prompt import (
    VLM_LLM_SUMMARY_SYSTEM_PROMPT,
    VLM_LLM_SUMMARY_USER_TEMPLATE,
)

# --- Activity Implementations ---


class SummarizeVisualElementInput(BaseModel):
    """Input for the summarize_visual_element activity."""

    context_text: str
    extraction_result: str
    description_result: str


async def summarize_visual_element(
    input: SummarizeVisualElementInput,
) -> VlmAnalysis:
    """
    Analyze VLM results using an LLM to detect hallucinations
    and extract metadata like captions and footnotes.
    """
    return await llm_invoke_structured(
        render_prompt_format(
            VLM_LLM_SUMMARY_USER_TEMPLATE,
            context_text=input.context_text,
            extraction_result=input.extraction_result,
            description_result=input.description_result,
        ),
        wrap_system_prompt(VLM_LLM_SUMMARY_SYSTEM_PROMPT),
        VlmAnalysis,
        model=ENV.VLM_SUMMARY_MODEL_NAME,
        temperature=0.1,
        max_tokens=get_config().VLM_SUMMARY_MAX_TOKENS,
    )


class ApplyVlmResultsInput(BaseModel):
    """Input for the apply_vlm_results activity."""

    vlm_results: list[VLMWorkflowOutput]
    markdown: str


@activity.defn(name="apply_vlm_results")
async def _apply_vlm_results(input: ApplyVlmResultsInput) -> str:
    """
    Apply VLM processing results to markdown content.

    Uses single-pass regex replacement to avoid O(n) full-string copies.
    Each original_content is replaced at most once (matching old replace(..., 1) semantics).
    """
    markdown = input.markdown
    vlm_results = input.vlm_results

    md_size_mb = len(markdown) / (1024 * 1024)
    if md_size_mb > 100:
        activity.logger.error(
            f"Source markdown is abnormally large ({md_size_mb:.1f} MB)! This indicates a bug earlier in the pipeline."
        )

    initial_size = len(markdown)
    max_allowed_size = max(initial_size * 10, 50 * 1024 * 1024)

    # Build replacement mapping: original_content -> replacement_block
    replacements: dict[str, str] = {}
    replacements_skipped = 0
    for vlm_output in vlm_results:
        if not vlm_output.original_content or not vlm_output.original_content.strip():
            activity.logger.warning("Skipping VLM result with empty original_content")
            replacements_skipped += 1
            continue
        if vlm_output.original_content not in replacements:
            replacements[vlm_output.original_content] = vlm_output.replacement_block

    if not replacements:
        if replacements_skipped > 0:
            activity.logger.info(f"Replacements: 0 made, {replacements_skipped} skipped")
        return markdown

    def _regex_replace_sync() -> tuple[str, int, int, bool]:
        """CPU-bound regex replacement -- runs in a thread to keep the event loop free."""
        sorted_patterns = sorted(replacements.keys(), key=len, reverse=True)
        combined_pattern = re.compile(
            "|".join(re.escape(p) for p in sorted_patterns),
            re.DOTALL,
        )

        replaced: set[str] = set()
        made = 0
        parts: list[str] = []
        last_end = 0
        aborted = False

        for match in combined_pattern.finditer(markdown):
            matched_text = match.group(0)
            if matched_text in replaced:
                continue

            replaced.add(matched_text)
            replacement = replacements[matched_text]

            parts.append(markdown[last_end : match.start()])
            parts.append(replacement)
            last_end = match.end()
            made += 1

            current_size = sum(len(p) for p in parts) + (len(markdown) - last_end)
            if current_size > max_allowed_size:
                aborted = True
                break

        parts.append(markdown[last_end:])
        result_md = "".join(parts)
        not_found_count = len(replacements) - len(replaced)
        return result_md, made, not_found_count, aborted

    final_md, replacements_made, not_found, aborted = await asyncio.to_thread(_regex_replace_sync)
    if aborted:
        final_size_approx = len(final_md) / (1024 * 1024)
        activity.logger.error(
            f"ABORTING: Output reached {final_size_approx:.1f} MB "
            f"(limit: {max_allowed_size / (1024 * 1024):.1f} MB) "
            f"after {replacements_made} replacements."
        )
    replacements_skipped += not_found

    if replacements_skipped > 0:
        activity.logger.info(
            f"Replacements: {replacements_made} made, {replacements_skipped} skipped"
            + (f" ({not_found} not found in markdown)" if not_found else "")
        )

    final_size_mb = len(final_md) / (1024 * 1024)
    growth_factor = len(final_md) / initial_size if initial_size > 0 else 0
    activity.logger.info(
        f"VLM replacement complete: {initial_size / (1024 * 1024):.2f} MB -> {final_size_mb:.2f} MB "
        f"({growth_factor:.1f}x growth)"
    )

    return final_md


# --- Workflow-Facing Wrappers ---


async def apply_vlm_results(
    vlm_results: list[VLMWorkflowOutput],
    markdown: str,
) -> str:
    """Workflow wrapper for apply_vlm_results activity."""
    return await workflow.execute_activity(
        _apply_vlm_results,
        ApplyVlmResultsInput(vlm_results=vlm_results, markdown=markdown),
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
