"""VLM (Vision Language Model) Temporal activity implementation (``@activity.defn``)."""

from __future__ import annotations

import httpx
from openai import APIStatusError
from temporal.activities.models import VlmActivityInput
from temporalio import activity
from temporalio.exceptions import ApplicationError

from llm_client._shared import (
    AUTH_ERROR_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES,
    get_client,
)


@activity.defn(name="vlm_invoke")
async def _vlm_invoke(input: VlmActivityInput) -> str:
    """Send an image + text prompt to a VLM via the LiteLLM proxy.

    Error handling mirrors :func:`llm_client.llm._llm_invoke`.
    """
    client = get_client()

    messages: list[dict] = []
    if input.system_prompt:
        messages.append({"role": "system", "content": input.system_prompt})
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{input.image_mime};base64,{input.image_b64}",
                    },
                },
                {"type": "text", "text": input.prompt},
            ],
        }
    )

    kwargs: dict = {
        "model": input.model,
        "messages": messages,
        "temperature": input.temperature,
        "max_completion_tokens": input.max_completion_tokens,
        "frequency_penalty": input.frequency_penalty,
        "presence_penalty": input.presence_penalty,
        "top_p": input.top_p,
    }
    is_retry = activity.info().attempt > 1
    if is_retry:
        kwargs["extra_body"] = {"cache": {"no-cache": True}}

    try:
        response = await client.chat.completions.create(**kwargs)
    except APIStatusError as e:
        if e.status_code in AUTH_ERROR_STATUS_CODES:
            activity.logger.critical(
                f"VLM AUTH ERROR HTTP {e.status_code} - API key/auth issue, will be retried (ops action required): {e}"
            )
            raise
        if e.status_code in NON_RETRYABLE_STATUS_CODES:
            raise ApplicationError(
                f"VLM HTTP {e.status_code}: {e}",
                non_retryable=True,
            ) from e
        raise
    except (httpx.TimeoutException, httpx.ConnectError, OSError):
        raise

    if not response.choices:
        raise ApplicationError("VLM returned empty choices", non_retryable=False)

    if (
        input.model == "ionos/lightonocr-2-1b"
        and response.choices[0].message.content == ""
    ):
        return ""

    result = response.choices[0].message.content or ""
    if not result:
        raise ApplicationError("VLM returned empty content", non_retryable=False)

    return result
