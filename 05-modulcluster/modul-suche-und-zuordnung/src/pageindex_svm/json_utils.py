"""Lightweight JSON extraction and parsing for LLM responses."""

from __future__ import annotations

import re

from json_repair import loads as json_repair_loads
from pydantic import BaseModel


def _strip_code_fences(text: str) -> str:
    """Remove Markdown code fences (```json ... ``` or ``` ... ```) from *text*."""
    json_blocks = list(re.finditer(r"```(?:json)?\s*([\s\S]*?)```", text))
    if json_blocks:
        return json_blocks[-1].group(1).strip()
    return text


def parse_llm_json[T: BaseModel](raw: str, output_class: type[T]) -> T:
    """Tolerantly parse JSON from an LLM response using json_repair, then validate against output_class.

    Raises ``ValueError`` on unrecoverable failures so callers can decide whether to retry.
    """
    content = raw.strip()
    if not content:
        raise ValueError("LLM returned empty content")

    content = _strip_code_fences(content)
    data = json_repair_loads(content)

    if isinstance(data, str):
        raise ValueError(f"No JSON object/array found in LLM response: {data[:200]}")

    return output_class.model_validate(data)
