"""Stage 3: Writer Workflow."""

from __future__ import annotations

import asyncio

from temporal.activities.llm import llm_invoke
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.config import config
from src.env import ENV
from src.models.types import (
    ChapterDraft,
    ChapterResult,
    ChapterWriterResponse,
    DetailedPlan,
    FinalOutput,
    Originaltext,
    PlanSection,
    QualityReviewerInput,
    ResultType,
    WriterInput,
)
from src.prompts.writer import (
    CHAPTER_WRITER_SYSTEM_PROMPT,
    ERGEBNIS_WRITER_SYSTEM_PROMPT,
    ChapterPromptContext,
    build_chapter_writer_prompt,
    build_ergebnis_writer_prompt,
)
from src.utils.json_parsing import parse_json_response
from src.workflows.quality_reviewer import run_quality_review


def find_ergebnis_chapter(plan: DetailedPlan) -> int | None:
    """Find the index of the result chapter in the plan."""
    if not plan.kapitel:
        return None

    ergebnis_indices = [i for i, kap in enumerate(plan.kapitel) if kap.titel.strip().lower() == "ergebnis"]
    if ergebnis_indices:
        return ergebnis_indices[-1]

    return len(plan.kapitel) - 1


def create_gliederung_kontext(plan: DetailedPlan) -> str:
    """Format the chapter outline as a numbered string."""
    lines = []
    for i, kap in enumerate(plan.kapitel, 1):
        lines.append(f"{i}. {kap.titel}: {kap.ziel}")
    return "\n".join(lines)


def prepare_chapter_chunks(
    kapitel: PlanSection,
    chunks_by_id: dict[str, Originaltext],
) -> tuple[str, list[str], str]:
    """Prepare chunk text, available IDs, and sub-chapter info for a chapter."""
    chapter_chunks = [chunks_by_id[sid] for sid in kapitel.svm_ids if sid in chunks_by_id]
    available_ids = [c.node_id for c in chapter_chunks]

    if chapter_chunks:
        chunks_text = "\n\n---\n\n".join(f"[{c.node_id}] {c.title}:\n{c.text}" for c in chapter_chunks)
    else:
        chunks_text = "*Keine zusätzlichen Quellen für dieses Kapitel zugeordnet.*"

    unterkapitel_info = ""
    if kapitel.unterkapitel:
        uk_lines = ["Unterkapitel:"]
        for uk in kapitel.unterkapitel:
            line = f"  - {uk.titel}: {uk.fokus}"
            if uk.struktur:
                line += f"\n    Struktur: {uk.struktur}"
            uk_lines.append(line)
        unterkapitel_info = "\n".join(uk_lines)

    return chunks_text, available_ids, unterkapitel_info


async def _write_chapter(
    prompt: str,
    system_prompt: str,
    temperature: float,
    label: str,
) -> ChapterWriterResponse:
    """Write a chapter via LLM, with retry on validation failure."""
    max_attempts = config.WRITER.VALIDATION_MAX_ATTEMPTS
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        content = await llm_invoke(
            prompt=prompt,
            system_prompt=system_prompt,
            model=ENV.LITELLM.MODEL,
            temperature=temperature,
            no_cache=True,
        )
        raw = parse_json_response(content)
        try:
            return ChapterWriterResponse.model_validate(raw)
        except Exception as e:
            last_error = e
            workflow.logger.warning(
                "%s validation failed (attempt %d/%d): %s",
                label,
                attempt,
                max_attempts,
                e,
            )
    raise ApplicationError(
        f"{label} validation failed after {max_attempts} attempts: {last_error}",
        non_retryable=False,
    ) from last_error

writer_workflow_id = "WriterWorkflow"


@workflow.defn(name=writer_workflow_id)
class WriterWorkflow:
    """Stage 3: Write chapters with quality review."""
    @workflow.run
    async def run(self, input: WriterInput) -> FinalOutput:
        """Orchestrate chapter writing and quality review."""
        plan = input.plan
        chunks_by_id: dict[str, Originaltext] = {c.node_id: c for c in input.originaltexte}

        gliederung_kontext = create_gliederung_kontext(plan)
        ergebnis_idx = find_ergebnis_chapter(plan)

        # Phase 1: Write and review all regular chapters in parallel
        drafts, kapitel_results = await self._write_regular_chapters(
            input,
            plan,
            chunks_by_id,
            gliederung_kontext,
            ergebnis_idx,
        )

        # Phase 2: Result chapter with previous chapters as context
        if ergebnis_idx is not None:
            await self._write_ergebnis_chapter(
                input,
                plan,
                chunks_by_id,
                gliederung_kontext,
                ergebnis_idx,
                drafts,
                kapitel_results,
            )

        # Derive verdict from the result chapter (determined by LLM)
        result = ResultType.NICHT_BEURTEILBAR
        for kap in kapitel_results:
            if kap.urteil is not None:
                result = kap.urteil

        kurzform = None
        for kap in kapitel_results:
            if kap.kurzform:
                kurzform = kap.kurzform

        return FinalOutput(
            satz_id=input.satz_id,
            norm=input.norm,
            satz_text=input.satz_text,
            result=result,
            kurzform=kurzform,
            plan=plan,
            kapitel=kapitel_results,
        )

    async def _write_regular_chapters(
        self,
        input: WriterInput,
        plan: DetailedPlan,
        chunks_by_id: dict[str, Originaltext],
        gliederung_kontext: str,
        ergebnis_idx: int | None,
    ) -> tuple[list[ChapterDraft], list[ChapterResult]]:
        """Write and review all regular chapters in parallel."""
        # Start all write activities immediately (non-blocking)
        chapter_prep: list[tuple[int, PlanSection, str, list[str], str | None]] = []
        for idx, kapitel in enumerate(plan.kapitel):
            if idx == ergebnis_idx:
                continue
            chunks_text, available_ids, unterkapitel_info = prepare_chapter_chunks(
                kapitel,
                chunks_by_id,
            )

            if not available_ids:
                chapter_prep.append((idx, kapitel, chunks_text, available_ids, None))
                continue

            ctx = ChapterPromptContext(
                satz_text=input.satz_text,
                norm=input.norm,
                gliederung_kontext=gliederung_kontext,
                kapitel_titel=kapitel.titel,
                kapitel_ziel=kapitel.ziel,
                unterkapitel_info=unterkapitel_info,
                available_ids=available_ids,
                chunks_text=chunks_text,
            )
            prompt = build_chapter_writer_prompt(ctx)
            chapter_prep.append((idx, kapitel, chunks_text, available_ids, prompt))

        # Process results in parallel + start quality reviews
        parallel_results = await asyncio.gather(
            *[
                self._write_and_review_chapter(idx, kapitel, chunks_text, available_ids, prompt, input)
                for idx, kapitel, chunks_text, available_ids, prompt in chapter_prep
            ]
        )

        # Sort results by original order
        parallel_results_sorted = sorted(parallel_results, key=lambda x: x[0])
        drafts: list[ChapterDraft] = []
        kapitel_results: list[ChapterResult] = []
        for _, draft, result in parallel_results_sorted:
            drafts.append(draft)
            kapitel_results.append(result)

        return drafts, kapitel_results

    async def _write_and_review_chapter(
        self,
        idx: int,
        kapitel: PlanSection,
        chunks_text: str,
        available_ids: list[str],
        prompt: str | None,
        input: WriterInput,
    ) -> tuple[int, ChapterDraft, ChapterResult]:
        """Write a chapter via LLM and run quality review."""
        if prompt is None:
            draft = ChapterDraft(
                titel=kapitel.titel,
                markdown=f"## {kapitel.titel}\n\n*Keine Quellen verfügbar*",
                used_svm_ids=[],
            )
        else:
            response = await _write_chapter(
                prompt=prompt,
                system_prompt=CHAPTER_WRITER_SYSTEM_PROMPT,
                temperature=0.3,
                label=f"Chapter '{kapitel.titel}'",
            )
            draft = ChapterDraft(
                titel=kapitel.titel,
                markdown=response.markdown,
                used_svm_ids=response.used_svm_ids,
            )

        review_result = await run_quality_review(QualityReviewerInput(
            draft=draft,
            chunks_text=chunks_text,
            available_ids=available_ids,
            satz_text=input.satz_text,
            norm=input.norm,
            kapitel_titel=kapitel.titel,
            kapitel_ziel=kapitel.ziel,
        ))
        draft.markdown = review_result.revised_markdown
        draft.used_svm_ids = review_result.revised_used_svm_ids

        result = ChapterResult(
            titel=draft.titel,
            markdown=draft.markdown,
            used_svm_ids=draft.used_svm_ids,
            quality_issues=review_result.issues,
        )
        return idx, draft, result

    async def _write_ergebnis_chapter(
        self,
        input: WriterInput,
        plan: DetailedPlan,
        chunks_by_id: dict[str, Originaltext],
        gliederung_kontext: str,
        ergebnis_idx: int,
        drafts: list[ChapterDraft],
        kapitel_results: list[ChapterResult],
    ) -> None:
        """Write and review the result chapter with context from previous chapters."""
        ergebnis_kapitel = plan.kapitel[ergebnis_idx]
        previous_chapters_text = "\n\n".join(d.markdown for d in drafts)
        chunks_text, available_ids, unterkapitel_info = prepare_chapter_chunks(
            ergebnis_kapitel,
            chunks_by_id,
        )

        # Build prompt and invoke LLM
        ctx = ChapterPromptContext(
            satz_text=input.satz_text,
            norm=input.norm,
            gliederung_kontext=gliederung_kontext,
            kapitel_titel=ergebnis_kapitel.titel,
            kapitel_ziel=ergebnis_kapitel.ziel,
            unterkapitel_info=unterkapitel_info,
            available_ids=available_ids,
            chunks_text=chunks_text,
            previous_chapters_text=previous_chapters_text,
        )
        response = await _write_chapter(
            prompt=build_ergebnis_writer_prompt(ctx),
            system_prompt=ERGEBNIS_WRITER_SYSTEM_PROMPT,
            temperature=0.2,
            label="Ergebnis chapter",
        )
        ergebnis_draft = ChapterDraft(
            titel=ergebnis_kapitel.titel,
            markdown=response.markdown,
            used_svm_ids=response.used_svm_ids,
            kurzform=response.kurzform,
            urteil=ResultType.parse_urteil(response.urteil) if response.urteil else None,
        )

        # Quality review
        ergebnis_review = await run_quality_review(QualityReviewerInput(
            draft=ergebnis_draft,
            chunks_text=chunks_text,
            available_ids=available_ids,
            satz_text=input.satz_text,
            norm=input.norm,
            kapitel_titel=ergebnis_kapitel.titel,
            kapitel_ziel=ergebnis_kapitel.ziel,
            previous_chapters_text=previous_chapters_text,
        ))
        ergebnis_draft.markdown = ergebnis_review.revised_markdown
        ergebnis_draft.used_svm_ids = ergebnis_review.revised_used_svm_ids
        if ergebnis_review.revised_kurzform is not None:
            ergebnis_draft.kurzform = ergebnis_review.revised_kurzform
        if ergebnis_review.revised_urteil is not None:
            ergebnis_draft.urteil = ResultType.parse_urteil(ergebnis_review.revised_urteil)

        kapitel_results.append(
            ChapterResult(
                titel=ergebnis_draft.titel,
                markdown=ergebnis_draft.markdown,
                used_svm_ids=ergebnis_draft.used_svm_ids,
                quality_issues=ergebnis_review.issues,
                kurzform=ergebnis_draft.kurzform,
                urteil=ergebnis_draft.urteil,
            )
        )
        drafts.append(ergebnis_draft)

