"""Workflow-facing helpers for the ``llm_invoke`` Temporal activity."""

from __future__ import annotations

from datetime import timedelta

from pydantic import BaseModel, ValidationError
from temporalio import workflow
from temporalio.common import RetryPolicy

from temporal.activities.models import ChatModel, LlmActivityInput, get_queue_for_model

_DEFAULT_RETRY = RetryPolicy(
    maximum_attempts=30,
    initial_interval=timedelta(seconds=60),
    maximum_interval=timedelta(seconds=120),
)


async def llm_invoke(
    prompt: str,
    system_prompt: str,
    model: ChatModel = "self-hosted/gpt-oss-120b",
    temperature: float = 0.7,
    *,
    top_p: float = 0.95,
    max_tokens: int | None = None,
    max_completion_tokens: int | None = None,
    reasoning_effort: str | None = None,
    no_cache: bool = True,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
) -> str:
    """Call the shared ``llm_invoke`` activity and return the raw text response.

    Can **only** be called from within a Temporal workflow.
    The task queue is auto-resolved from the model name.
    """
    resolved_queue = get_queue_for_model(model)
    return await workflow.execute_activity(
        "llm_invoke",
        LlmActivityInput(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            max_completion_tokens=max_completion_tokens,
            reasoning_effort=reasoning_effort,
            no_cache=no_cache,
        ),
        task_queue=resolved_queue,
        start_to_close_timeout=timedelta(seconds=1800),
        retry_policy=retry_policy,
    )


async def llm_invoke_structured[T: BaseModel](
    prompt: str,
    system_prompt: str,
    output_class: type[T],
    model: ChatModel = "self-hosted/gpt-oss-120b",
    temperature: float = 0.7,
    *,
    top_p: float = 0.95,
    max_tokens: int | None = None,
    max_completion_tokens: int | None = None,
    reasoning_effort: str | None = None,
    no_cache: bool = True,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
    max_validation_attempts: int = 30,
) -> T:
    """Call the shared ``llm_invoke`` activity with a JSON schema constraint
    and return the response parsed into *output_class*.

    If the LLM response passes the JSON-schema check in the activity but fails
    Pydantic validation (e.g. custom ``@field_validator``), the LLM call is
    retried up to *max_validation_attempts* times before raising.

    Can **only** be called from within a Temporal workflow.
    The task queue is auto-resolved from the model name.
    """
    schema = output_class.model_json_schema()
    resolved_queue = get_queue_for_model(model)

    for attempt in range(1, max_validation_attempts + 1):
        raw = await workflow.execute_activity(
            "llm_invoke",
            LlmActivityInput(
                prompt=prompt,
                system_prompt=system_prompt,
                model=model,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
                max_completion_tokens=max_completion_tokens,
                response_schema=schema,
                schema_name=output_class.__name__,
                reasoning_effort=reasoning_effort,
                no_cache=no_cache or attempt > 1,
            ),
            task_queue=resolved_queue,
            start_to_close_timeout=timedelta(seconds=1800),
            retry_policy=retry_policy,
            summary=f"llm_invoke {output_class.__name__} attempt {attempt}/{max_validation_attempts}",
        )

        try:
            return output_class.model_validate_json(raw)
        except ValidationError:
            if attempt == max_validation_attempts:
                raise
            workflow.logger.warning(
                "Pydantic validation failed for %s (attempt %d/%d), retrying LLM call",
                output_class.__name__,
                attempt,
                max_validation_attempts,
            )

    # unreachable – satisfies type checker
    raise AssertionError("unreachable")
