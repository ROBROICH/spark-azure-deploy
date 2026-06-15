"""LLM Temporal activity implementation (``@activity.defn``)."""

from __future__ import annotations

import json
import re
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile

from json_repair import loads as json_repair_loads
from openai import APIStatusError
from temporal.activities.models import LlmActivityInput
from temporalio import activity
from temporalio.exceptions import ApplicationError

from llm_client._shared import (
    AUTH_ERROR_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES,
    get_client,
)
from llm_client.env import ENV

# Models that support json_schema with strict constrained decoding.
_STRICT_SCHEMA_MODELS = ("qwen", "ministral", "mistral-small-2506", "gemma")
_CACHE_FORMAT_VERSION = 1


def _extract_json(text: str) -> str | None:
    """Extract and repair JSON from text that may contain a reasoning prefix.

    Uses json_repair to handle:
    - Reasoning/thinking text before or after JSON
    - Markdown code fences (```json ... ```)
    - Trailing commas, missing quotes
    - Truncated JSON (incomplete due to max_tokens)
    """
    # Strip markdown code fences first
    json_blocks = list(re.finditer(r"```(?:json)?\s*([\s\S]*?)```", text))
    if json_blocks:
        text = json_blocks[-1].group(1).strip()

    result = json_repair_loads(text)
    if isinstance(result, (dict, list)):
        return json.dumps(result, ensure_ascii=False)
    return None


def _model_supports_strict_schema(model: str) -> bool:
    """Return True if the model backend supports json_schema with strict: True."""
    return any(tag in model.lower() for tag in _STRICT_SCHEMA_MODELS)


def _build_messages(prompt: str, system_prompt: str) -> list[dict]:
    """Assemble the chat messages list from user prompt and optional system prompt."""
    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    return messages


def _cache_path(input: LlmActivityInput) -> Path | None:
    """Compute the deterministic disk-cache file path for this request, or None if caching is disabled."""
    if not ENV.LITELLM.DISK_CACHE_DIR:
        return None
    cache_key_payload = {
        "version": _CACHE_FORMAT_VERSION,
        "input": input.model_dump(mode="json"),
    }
    cache_key = sha256(
        json.dumps(cache_key_payload, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()
    return Path(ENV.LITELLM.DISK_CACHE_DIR).expanduser() / f"{cache_key}.json"


def _read_cached_response(path: Path | None) -> str | None:
    """Return the cached response string if a valid cache entry exists, else None."""
    if path is None or not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        activity.logger.warning(
            "Ignoring unreadable LLM disk cache entry %s: %s", path, e
        )
        return None
    if payload.get("version") != _CACHE_FORMAT_VERSION:
        return None
    response = payload.get("response")
    return response if isinstance(response, str) else None


def _write_cached_response(path: Path | None, response: str) -> None:
    """Atomically write the response to the disk cache."""
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": _CACHE_FORMAT_VERSION, "response": response}
    try:
        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            json.dump(payload, tmp, ensure_ascii=False)
            tmp.write("\n")
            tmp_path = Path(tmp.name)
        tmp_path.replace(path)
    except OSError as e:
        activity.logger.warning("Failed to write LLM disk cache entry %s: %s", path, e)


def _system_prompt_for_request(
    input: LlmActivityInput, *, use_strict_schema: bool
) -> str:
    """Append JSON schema hint to the system prompt for non-strict models."""
    system_prompt = input.system_prompt
    if input.response_schema is None or use_strict_schema:
        return system_prompt

    schema_hint = (
        "\n\nYou MUST respond with valid JSON that conforms to this JSON schema:\n"
        f"```json\n{json.dumps(input.response_schema, ensure_ascii=False)}\n```"
    )
    return (system_prompt + schema_hint) if system_prompt else schema_hint.lstrip()


def _add_optional_completion_kwargs(kwargs: dict, input: LlmActivityInput) -> None:
    """Add max_tokens, max_completion_tokens, and reasoning_effort if set."""
    if input.max_tokens is not None:
        kwargs["max_tokens"] = input.max_tokens
    if input.max_completion_tokens is not None:
        kwargs["max_completion_tokens"] = input.max_completion_tokens
    if input.reasoning_effort is not None:
        kwargs["reasoning_effort"] = input.reasoning_effort


def _add_response_format_kwargs(
    kwargs: dict,
    input: LlmActivityInput,
    *,
    use_strict_schema: bool,
) -> None:
    """Set response_format to json_schema (strict) or json_object depending on model support."""
    if input.response_schema is None:
        return

    if use_strict_schema:
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": input.schema_name or "response",
                "schema": input.response_schema,
                "strict": True,
            },
        }
        return

    kwargs["response_format"] = {"type": "json_object"}


def _build_completion_kwargs(input: LlmActivityInput) -> dict:
    """Assemble the full kwargs dict for the OpenAI chat.completions.create call."""
    use_strict_schema = (
        input.response_schema is not None and _model_supports_strict_schema(input.model)
    )
    system_prompt = _system_prompt_for_request(
        input, use_strict_schema=use_strict_schema
    )

    kwargs: dict = {
        "model": input.model,
        "messages": _build_messages(input.prompt, system_prompt),
        "temperature": input.temperature,
        "top_p": input.top_p,
    }
    _add_optional_completion_kwargs(kwargs, input)
    _add_response_format_kwargs(kwargs, input, use_strict_schema=use_strict_schema)

    is_retry = activity.info().attempt > 1
    if input.no_cache or is_retry:
        kwargs["extra_body"] = {"cache": {"no-cache": True}}

    return kwargs


def _raise_for_api_status_error(error: APIStatusError) -> None:
    """Classify API errors as non-retryable (404/422), auth-critical (401/403), or retryable."""
    if error.status_code in AUTH_ERROR_STATUS_CODES:
        activity.logger.critical(
            f"LLM AUTH ERROR HTTP {error.status_code} \u2013 API key/auth issue, "
            f"will be retried (ops action required): {error}"
        )
        raise error
    if error.status_code in NON_RETRYABLE_STATUS_CODES:
        raise ApplicationError(
            f"LLM HTTP {error.status_code}: {error}",
            non_retryable=True,
        ) from error
    raise error


@activity.defn(name="llm_invoke")
async def _llm_invoke(input: LlmActivityInput) -> str:
    """Execute a single LLM chat-completion via the LiteLLM proxy.

    Error handling:
    - 400/404/422 → ``ApplicationError(non_retryable=True)``
    - All other errors → re-raise so Temporal retries automatically
    """
    cache_path = None if input.no_cache else _cache_path(input)
    cached_response = _read_cached_response(cache_path)
    if cached_response is not None:
        activity.logger.info("LLM disk cache hit for %s", cache_path)
        return cached_response

    try:
        response = await get_client().chat.completions.create(
            **_build_completion_kwargs(input)
        )
    except APIStatusError as e:
        _raise_for_api_status_error(e)

    if not response.choices:
        raise ApplicationError("LLM returned empty choices", non_retryable=False)

    choice = response.choices[0].message
    result = choice.content or getattr(choice, "reasoning_content", None) or ""

    if not result:
        raise ApplicationError("LLM returned empty content", non_retryable=False)

    if input.response_schema is not None:
        try:
            json.loads(result)
        except json.JSONDecodeError as e:
            # Model may have prefixed reasoning/thinking text before the JSON object.
            # Try to extract the first top-level JSON object or array.
            extracted = _extract_json(result)
            if extracted is not None:
                activity.logger.warning(
                    "LLM response contained non-JSON prefix, extracted JSON | model=%s",
                    input.model,
                )
                result = extracted
            else:
                raise ApplicationError(
                    f"LLM returned invalid JSON: could not extract JSON | model={input.model}",
                    non_retryable=False,
                ) from e

    _write_cached_response(cache_path, result)
    return result
