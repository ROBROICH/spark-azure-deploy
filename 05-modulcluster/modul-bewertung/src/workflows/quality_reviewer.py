"""Stage 3b: Quality Reviewer."""

from __future__ import annotations

from temporal.activities.llm import llm_invoke
from temporalio import workflow

from src.config import config
from src.env import ENV
from src.models.types import ChapterDraft, QualityReviewerInput, QualityReviewerResponse, QualityReviewResult
from src.prompts.quality_reviewer import build_quality_reviewer_prompt
from src.utils.json_parsing import parse_json_response


async def run_quality_review(input: QualityReviewerInput) -> QualityReviewResult:
    """Run quality review on a chapter draft via LLM, retrying on validation errors."""
    system_prompt, user_prompt = build_quality_reviewer_prompt(input)

    max_attempts = config.QUALITY_REVIEWER.MAX_ATTEMPTS

    for attempt in range(1, max_attempts + 1):
        content = await llm_invoke(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=ENV.LITELLM.MODEL,
            temperature=0.1,
            no_cache=True,
        )

        result = _try_parse_review(content, input.available_ids)
        if result is not None:
            return result

        if attempt < max_attempts:
            continue

    workflow.logger.warning(
        "Quality review for '%s' failed after %d attempts — keeping original draft",
        input.kapitel_titel,
        max_attempts,
    )
    return _fallback_result(input.draft)


def _try_parse_review(
    content: str,
    available_ids: list[str],
) -> QualityReviewResult | None:
    """Try to parse the LLM quality review response. Returns None on validation error."""
    try:
        raw = parse_json_response(content)
        response = QualityReviewerResponse.model_validate(raw)
    except Exception:
        return None

    valid_ids = set(available_ids)
    validated_ids = [sid.strip() for sid in response.revised_used_svm_ids if sid.strip() in valid_ids]

    return QualityReviewResult(
        issues=response.issues,
        revised_markdown=response.revised_markdown,
        revised_used_svm_ids=validated_ids,
        revised_kurzform=response.revised_kurzform,
        revised_urteil=response.revised_urteil,
    )


def _fallback_result(draft: ChapterDraft) -> QualityReviewResult:
    """Graceful fallback: return original draft unchanged."""
    return QualityReviewResult(
        issues=[],
        revised_markdown=draft.markdown,
        revised_used_svm_ids=draft.used_svm_ids,
        revised_kurzform=draft.kurzform,
        revised_urteil=draft.urteil.value if draft.urteil else None,
    )
