"""Lightweight JSON extraction and parsing for LLM responses."""

from __future__ import annotations

import re

from json_repair import loads as json_repair_loads
from pydantic import BaseModel

_FENCE = "```"


def _last_fenced_block(text: str) -> str | None:
    """Return the content of the LAST Markdown code block in *text*, or ``None`` if there is none.

    A ```json fence takes precedence over plain ``` fences. The block runs from its opening
    fence to the next closing fence or, if the LLM omitted the closing fence, to the end of text.
    """
    json_fences = list(re.finditer(r"```json\s*", text))
    if json_fences:
        start = json_fences[-1].end()
    else:
        # Plain fences alternate opening/closing: the last opener is the last even-indexed fence.
        fences = [m.start() for m in re.finditer(_FENCE, text)]
        if not fences:
            return None
        start = fences[(len(fences) - 1) // 2 * 2] + len(_FENCE)
    tail = text[start:]
    closing = tail.find(_FENCE)
    block = (tail if closing == -1 else tail[:closing]).strip()
    # A lone trailing fence (opening fence missing) yields nothing; let the caller fall back.
    return block or None


def _strip_code_fences(text: str) -> str:
    """Remove Markdown code fences (```json ... ``` or ``` ... ```, closing fence optional) from *text*."""
    block = _last_fenced_block(text)
    return block if block is not None else text


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
