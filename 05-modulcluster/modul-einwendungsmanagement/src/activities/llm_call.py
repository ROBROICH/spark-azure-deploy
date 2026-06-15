from __future__ import annotations

from typing import Any, Literal

from prompt_injection.prompt_defense import render_prompt, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import _DEFAULT_RETRY, llm_invoke_structured
from temporal.activities.models import ChatModel
from temporalio import workflow
from temporalio.common import RetryPolicy


async def llm_invoke_structured_guarded[T: BaseModel](
    prompt_template: str,
    system_prompt: str,
    output_class: type[T],
    model: ChatModel = "self-hosted/gpt-oss-120b",
    temperature: float = 0.7,
    *,
    top_p: float = 0.95,
    max_tokens: int | None = None,
    max_completion_tokens: int | None = None,
    max_prompt_size: int | None = None,
    prompt_truncation_msg: str = "\n... [truncated] ...\n",
    reasoning_effort: str | None = None,
    template_kwargs: dict[str, Any] | None = None,
    no_cache: bool = False,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
    max_validation_attempts: int = 3,
    prompt_language: Literal["de", "en", "vlm_de"] = "de",
) -> T:
    """Render Jinja2 template, truncate if needed, then call ``llm_invoke_structured``.

    The ``prompt_template`` must be a Jinja2 template containing the placeholders
    ``{{external_data_tag_open}}`` and ``{{external_data_tag_close}}`` to delimit
    untrusted external content.

    Can only be called from within a Temporal workflow.
    """
    prompt = render_prompt(prompt_template, **(template_kwargs or {}))
    system_prompt = wrap_system_prompt(system_prompt, lang=prompt_language)
    if max_prompt_size is not None:
        sys_len = len(system_prompt) if system_prompt else 0
        user_prompt_max_len = max_prompt_size - sys_len - len(prompt_truncation_msg)
        if user_prompt_max_len <= 0:
            raise ValueError(f"System prompt length ({sys_len}) exceeds max prompt size ({max_prompt_size}).")
        original_len = len(prompt)
        if original_len > user_prompt_max_len:
            half = user_prompt_max_len // 2
            prompt = prompt[:half] + prompt_truncation_msg + prompt[-half:]
            workflow.logger.warning(f"User prompt truncated. original={original_len} truncated={len(prompt)}")
    return await llm_invoke_structured(
        prompt,
        system_prompt,
        output_class,
        model=model,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        max_completion_tokens=max_completion_tokens,
        reasoning_effort=reasoning_effort,
        no_cache=no_cache,
        retry_policy=retry_policy,
        max_validation_attempts=max_validation_attempts,
    )
