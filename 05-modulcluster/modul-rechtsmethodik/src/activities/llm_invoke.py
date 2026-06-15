from typing import Any, NotRequired, TypedDict, cast

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import (
    llm_invoke_structured,
)
from temporal.activities.models import ChatModel

SUPPORTED_THINKING_MODELS = {"nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1.5"}


class LlmInvokeInput(TypedDict):
    """Input for invoking an LLM via the Temporal activity."""

    model_name: str
    prompt_template: str
    input_dict: dict[str, Any]
    temperature: NotRequired[float]
    thinking: NotRequired[bool | None]


def _get_system_prompt(thinking: bool | None, model_name: str) -> str:
    thinking = bool(thinking)
    if thinking and model_name not in SUPPORTED_THINKING_MODELS:
        raise ValueError(f"Thinking mode is not implemented for model '{model_name}'.")
    if model_name == "nvidia/llama-3.1-nemotron-ultra-253b-v1":
        return f"detailed thinking {'on' if thinking else 'off'}"
    if model_name == "nvidia/llama-3.3-nemotron-super-49b-v1.5":
        return "/think" if thinking else "/no_think"
    return ""


async def llm_invoke[TOutput: BaseModel](
    activity_input: LlmInvokeInput,
    output_class: type[TOutput],
) -> TOutput:
    """Invoke LLM with structured output."""
    formatted = render_prompt_format(activity_input["prompt_template"], **activity_input["input_dict"])

    system_prompt = _get_system_prompt(activity_input.get("thinking"), activity_input["model_name"])
    system_prompt = wrap_system_prompt(system_prompt, "de")

    return await llm_invoke_structured(
        prompt=formatted,
        system_prompt=system_prompt,
        output_class=output_class,
        model=cast(ChatModel, activity_input["model_name"]),
        temperature=activity_input.get("temperature", 0.0),
    )
