"""Stage 2: Planner Workflow — generates a DetailedPlan, with optional
DetailPlanner for large micro sets that exceed the planner context window."""

from __future__ import annotations

import json
from typing import Any

from temporal.activities.llm import llm_invoke
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.config import CHILD_WORKFLOW_RETRY_POLICY, config
from src.env import ENV
from src.models.types import (
    DetailedPlan,
    DetailPlannerInput,
    DetailPlannerResult,
    MicroSummary,  # noqa: F401 — used at runtime via input.micros
    PlannerInput,
)
from src.prompts.planner import (
    PLANNER_SYSTEM_PROMPT,
    build_planner_correction_prompt,
    build_planner_prompt,
)
from src.utils.json_parsing import parse_json_response
from src.utils.plan_validation import PlanSanitisationResult, sanitise_plan
from src.workflows.detail_planner import DetailPlannerWorkflow


def _assemble_plan(
    grob_plan: DetailedPlan,
    detail_result: DetailPlannerResult,
    all_svm_ids: set[str],
) -> DetailedPlan:
    """Merge Grob-Plan with Detail-Planner assignments into a final DetailedPlan."""
    plan_data = grob_plan.model_dump()
    kapitel = plan_data["kapitel"]

    for svm_id, kapitel_index in detail_result.assignments.items():
        if 0 <= kapitel_index < len(kapitel) and svm_id not in kapitel[kapitel_index]["svm_ids"]:
            kapitel[kapitel_index]["svm_ids"].append(svm_id)

    result = sanitise_plan(plan_data, all_svm_ids)
    return DetailedPlan.model_validate(result.plan_data)

planner_workflow_id = "PlannerWorkflow"


@workflow.defn(name=planner_workflow_id)
class PlannerWorkflow:
    """Stage 2: Generate a structured plan from micro-summaries."""
    @workflow.run
    async def run(self, input: PlannerInput) -> DetailedPlan:
        """Generate a chapter plan. For large micro sets, samples a subset for
        the LLM planner and delegates remaining assignments to the DetailPlanner."""
        max_micros = config.DETAIL_PLANNER.MAX_PLANNER_MICROS

        if len(input.micros) <= max_micros:
            return await self._generate_plan(input)

        # Deterministic stride-based sampling for even coverage
        step = len(input.micros) / max_micros
        sampled = [input.micros[int(i * step)] for i in range(max_micros)]
        sampled_ids = {m.svm_id for m in sampled}
        remaining = [m for m in input.micros if m.svm_id not in sampled_ids]

        sampled_input = PlannerInput(
            norm=input.norm,
            satz_text=input.satz_text,
            micros=sampled,
        )
        plan = await self._generate_plan(sampled_input)

        detail_result: DetailPlannerResult = await workflow.execute_child_workflow(
            DetailPlannerWorkflow.run,
            DetailPlannerInput(
                plan=plan,
                micros_by_id={m.svm_id: m for m in sampled},
                filtered_micros=remaining,
                norm=input.norm,
                satz_text=input.satz_text,
            ),
            id=str(workflow.uuid4()),
            retry_policy=CHILD_WORKFLOW_RETRY_POLICY,
        )

        return _assemble_plan(plan, detail_result, {m.svm_id for m in input.micros})

    async def _generate_plan(self, input: PlannerInput) -> DetailedPlan:
        """Call the LLM to generate and validate a chapter plan, retrying on validation errors."""
        available_svm_ids = {m.svm_id for m in input.micros}

        prompt = build_planner_prompt(input)
        system_prompt = PLANNER_SYSTEM_PROMPT
        temperature = 0.3

        last_error: str | None = None
        data: dict[str, Any] | list[Any] | None = None
        result: PlanSanitisationResult | None = None

        max_attempts = config.PLANNER.VALIDATION_MAX_ATTEMPTS

        for attempt in range(1, max_attempts + 1):
            content = await llm_invoke(
                prompt=prompt,
                system_prompt=system_prompt,
                model=ENV.LITELLM.MODEL,
                temperature=temperature,
                no_cache=True,
            )

            try:
                data = parse_json_response(content)
                result = sanitise_plan(data, available_svm_ids)
                return DetailedPlan.model_validate(result.plan_data)
            except Exception as e:
                errors = [str(e)]

                if attempt < max_attempts:
                    workflow.logger.warning(
                        "Plan validation failed (attempt %d/%d), sending correction prompt. Errors: %s",
                        attempt,
                        max_attempts,
                        errors,
                    )
                    failed_json = json.dumps(data, ensure_ascii=False, indent=2) if isinstance(data, (dict, list)) else "{}"
                    micros_text = "\n".join(
                        f"[{m.svm_id}] {m.kernaussage}" for m in input.micros
                    )
                    unassigned = result.unassigned_svm_ids if result is not None else sorted(available_svm_ids)
                    system_prompt, prompt = build_planner_correction_prompt(
                        failed_json=failed_json,
                        errors=errors,
                        unassigned_svm_ids=unassigned,
                        tbm=input.satz_text,
                        norm=input.norm,
                        micros_text=micros_text,
                    )
                else:
                    last_error = "; ".join(errors)

        raise ApplicationError(
            f"Plan validation failed (will be retried): {last_error}",
            non_retryable=False,
        )
