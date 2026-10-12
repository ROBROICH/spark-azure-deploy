"""Workflow-facing helper for the ``vlm_invoke`` Temporal activity."""

from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from temporal.activities.models import VlmModel, VlmActivityInput, get_queue_for_model

_DEFAULT_RETRY = RetryPolicy(
    maximum_attempts=30,
    initial_interval=timedelta(seconds=60),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=120),
)


async def vlm_invoke(
    image_b64: str,
    image_mime: str,
    prompt: str,
    model: VlmModel,
    *,
    system_prompt: str = "",
    temperature: float = 0.3,
    max_completion_tokens: int | None = None,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
    frequency_penalty: float = 0,
    presence_penalty: float = 0,
    top_p: float = 0.9,
) -> str:
    """Call the shared ``vlm_invoke`` activity and return the text response.

    Can **only** be called from within a Temporal workflow.
    The task queue is auto-resolved from the model name.
    """
    resolved_queue = get_queue_for_model(model)
    return await workflow.execute_activity(
        "vlm_invoke",
        VlmActivityInput(
            image_b64=image_b64,
            image_mime=image_mime,
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_completion_tokens=max_completion_tokens,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty,
            top_p=top_p,
        ),
        task_queue=resolved_queue,
        start_to_close_timeout=timedelta(seconds=1800),
        retry_policy=retry_policy,
    )
