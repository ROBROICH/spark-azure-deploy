"""Temporal workflow for single-file PDF redaction (anonymization)."""

import asyncio
from datetime import timedelta
from typing import Awaitable

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    from temporal.activities.llm import llm_invoke_structured
    from temporal.activities.models import ChatModel
    from temporal.registry import ANONYMISIERUNG_WORKFLOW
    from temporal.utils import sliding_window

    from src.activities.redaction_activities import (
        apply_redactions,
        detect_pii_presidio,
        extract_texts,
    )
    from src.config import config
    from src.env import ENV, LLMConfig
    from src.models.schemas import (
        ApplyRedactionsInput,
        DetectPiiPresidioInput,
        DetectPiiPresidioResult,
        ExtractTextsInput,
        PageTextData,
    )
    from src.prompts.pii_extraction import PII_EXTRACTION_SYSTEM_PROMPT, PII_FILTER_SYSTEM_PROMPT
    from src.utils import chunk_list
    from src.utils.pii_extraction import (
        PiiResponseSchema,
        build_filter_prompt,
        build_multi_page_prompt,
        merge_page_pii,
    )


PII_DETECTION_INCOMPLETE_ERROR = "PiiDetectionIncomplete"


def _raise_for_error_pages(error_pages: list[int]) -> None:
    """Fail closed when PII detection did not complete for every page."""
    page_indexes = sorted(set(error_pages))
    if page_indexes:
        raise ApplicationError(
            f"PII detection incomplete for zero-based page indexes {page_indexes}",
            type=PII_DETECTION_INCOMPLETE_ERROR,
            non_retryable=True,
        )


class _RedactionPipelineMixin:
    """Shared PII detection helpers for redaction workflows."""

    async def _detect_pii_combined(
        self,
        pages: list[PageTextData],
        llm_cfg: LLMConfig,
    ) -> dict[int, set[str]]:
        """Run Presidio + optional LLM detection in parallel, merge results."""
        presidio_task = workflow.execute_activity(
            detect_pii_presidio,
            DetectPiiPresidioInput(pages=pages),
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=2),
        )

        if ENV.LLM_ENABLED:
            presidio_pii, llm_pii = await asyncio.gather(
                self._presidio_then_filter(presidio_task, llm_cfg),
                self._detect_pii_llm(pages, llm_cfg),
            )
        else:
            presidio_result = await presidio_task
            llm_pii = {p.page_number: set() for p in pages}
            presidio_pii = {p.page_number: list(p.pii_terms) for p in presidio_result.page_pii}

        return merge_page_pii(llm_pii, presidio_pii)

    async def _presidio_then_filter(
        self,
        presidio_task: Awaitable[DetectPiiPresidioResult],
        llm_cfg: LLMConfig,
    ) -> dict[int, list[str]]:
        """Await Presidio, then filter results via LLM."""
        presidio_result = await presidio_task
        return await self._filter_presidio_with_llm(presidio_result, llm_cfg)

    async def _filter_presidio_with_llm(
        self,
        presidio_result: DetectPiiPresidioResult,
        llm_cfg: LLMConfig,
    ) -> dict[int, list[str]]:
        """Filter Presidio candidates to true PII via LLM. Falls back to unfiltered on error."""
        per_page: dict[int, list[str]] = {p.page_number: list(p.pii_terms) for p in presidio_result.page_pii}
        candidates: set[str] = {term for terms in per_page.values() for term in terms}
        if not candidates:
            return per_page

        prompt = build_filter_prompt(sorted(candidates), max_prompt_size=llm_cfg.MAX_PROMPT_SIZE)
        model: ChatModel = llm_cfg.MODEL
        try:
            result = await llm_invoke_structured(
                prompt=prompt,
                system_prompt=PII_FILTER_SYSTEM_PROMPT,
                output_class=PiiResponseSchema,
                model=model,
                temperature=llm_cfg.TEMPERATURE,
                top_p=llm_cfg.TOP_P,
            )
        except Exception as exc:  # pragma: no cover - degrade gracefully
            workflow.logger.error(
                "Presidio LLM filter call failed (%s); using unfiltered Presidio results",
                exc,
            )
            return per_page

        accepted = sorted({t for t in result.to_terms() if t})
        # Broadcast accepted terms to every page.
        return {pn: list(accepted) for pn in per_page}

    async def _detect_pii_llm(
        self,
        pages: list[PageTextData],
        llm_cfg: LLMConfig,
    ) -> dict[int, set[str]]:
        """Detect PII via LLM with sliding concurrency window."""
        page_pii: dict[int, set[str]] = {p.page_number: set() for p in pages}
        all_terms: set[str] = set()

        pages_per_call = llm_cfg.PAGES_PER_CALL
        page_data_tuples = [(p.page_number, p.page_lines) for p in pages]
        page_groups = chunk_list(page_data_tuples, pages_per_call)

        prompt_tasks: list[tuple[list[int], str]] = []
        for group in page_groups:
            prompt = build_multi_page_prompt(group, max_prompt_size=llm_cfg.MAX_PROMPT_SIZE)
            group_page_nums = [pn for pn, _ in group]
            prompt_tasks.append((group_page_nums, prompt))

        model: ChatModel = llm_cfg.MODEL
        error_token = config.ERROR_TOKEN

        async def _invoke(item: tuple[list[int], str]) -> tuple[list[int], PiiResponseSchema | None]:
            group_page_nums, prompt = item
            try:
                result = await llm_invoke_structured(
                    prompt=prompt,
                    system_prompt=PII_EXTRACTION_SYSTEM_PROMPT,
                    output_class=PiiResponseSchema,
                    model=model,
                    temperature=llm_cfg.TEMPERATURE,
                    top_p=llm_cfg.TOP_P,
                )
                return (group_page_nums, result)
            except Exception as exc:
                workflow.logger.error(
                    "LLM call failed for pages %s: %s",
                    group_page_nums,
                    exc,
                )
                for pn in group_page_nums:
                    page_pii[pn].add(error_token)
                return (group_page_nums, None)

        results = await sliding_window(
            items=prompt_tasks,
            fn=_invoke,
            concurrency=config.BATCH_SIZE,
        )

        for group_page_nums, result in results:
            if result is not None:
                all_terms.update(result.to_terms())

        # Broadcast accepted terms to all pages (error tokens stay page-local).
        for pn in page_pii:
            page_pii[pn].update(all_terms)
        return page_pii


@workflow.defn(name=ANONYMISIERUNG_WORKFLOW.name)
class RedactionWorkflow(_RedactionPipelineMixin):
    """Single-file PDF redaction workflow."""

    @workflow.run
    async def run(self, inp: bytes) -> bytes:
        """Execute the full redaction pipeline for one document."""
        llm_cfg = ENV.LLM

        extract_result = await workflow.execute_activity(
            extract_texts,
            ExtractTextsInput(pdf_data=inp),
            start_to_close_timeout=timedelta(minutes=30),
            heartbeat_timeout=timedelta(minutes=25),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        page_pii = await self._detect_pii_combined(extract_result.pages, llm_cfg)

        # Flatten: all terms are broadcast to every page, so pass once.
        error_token = config.ERROR_TOKEN
        all_terms = set()
        error_pages = []
        for pn, terms in page_pii.items():
            if error_token in terms:
                error_pages.append(pn)
                terms = terms - {error_token}
            all_terms.update(terms)

        _raise_for_error_pages(error_pages)

        redaction_result = await workflow.execute_activity(
            apply_redactions,
            ApplyRedactionsInput(
                pdf_data=extract_result.ocr_pdf_data,
                pii_terms=sorted(all_terms),
                error_pages=error_pages,
            ),
            start_to_close_timeout=timedelta(minutes=30),
            heartbeat_timeout=timedelta(minutes=25),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        _raise_for_error_pages(redaction_result.error_pages)

        workflow.logger.info(
            "Redaction complete: %d pages, %d matches",
            redaction_result.pages_processed,
            redaction_result.matches_found,
        )

        return redaction_result.redacted_pdf
