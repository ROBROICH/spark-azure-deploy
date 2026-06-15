"""Stage 1.5: Applicability pre-check — determines whether a TBM is
applicable to the project before investing in full planning and writing."""

from __future__ import annotations

from temporal.activities.llm import llm_invoke
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.config import config
from src.env import ENV
from src.models.types import (
    ApplicabilityInput,
    ApplicabilityResult,
    MicroSummary,  # noqa: F401 — used at runtime via input.micros
)
from src.prompts.applicability import APPLICABILITY_SYSTEM_PROMPT, build_applicability_prompt
from src.utils.json_parsing import parse_json_response

applicability_workflow_id = "ApplicabilityWorkflow"


@workflow.defn(name=applicability_workflow_id)
class ApplicabilityWorkflow:
    """Stage 1.5: Check whether the TBM is applicable to the project."""

    @workflow.run
    async def run(self, input: ApplicabilityInput) -> ApplicabilityResult:
        """Evaluate TBM applicability. Samples micros for large sets."""
        max_micros = config.APPLICABILITY.MAX_MICROS
        micros = input.micros

        # Deterministic stride-based sampling for even coverage
        if len(micros) > max_micros:
            step = len(micros) / max_micros
            micros = [input.micros[int(i * step)] for i in range(max_micros)]

        prompt = build_applicability_prompt(input, micros)

        content = await llm_invoke(
            prompt=prompt,
            system_prompt=APPLICABILITY_SYSTEM_PROMPT,
            model=ENV.LITELLM.MODEL,
            temperature=0.1,
            no_cache=True,
        )

        try:
            data = parse_json_response(content)
            return ApplicabilityResult.model_validate(data)
        except ApplicationError:
            raise
        except Exception as e:
            raise ApplicationError(
                f"Applicability check validation failed (will be retried): {e}",
                non_retryable=False,
            ) from e
