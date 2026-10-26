"""JSON extraction and parsing from LLM responses."""

from __future__ import annotations

import re
from typing import Any

from json_repair import loads as json_repair_loads
from temporalio.exceptions import ApplicationError


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


def extract_json(content: str) -> str:
    """Extract relevant JSON text from an LLM response.

    Supports:
    - <output>...</output> tags (Chain-of-Verification)
    - ```json ... ``` Markdown code blocks (takes the LAST block; closing fence optional)
    """
    content = content.strip()

    # Extract from <output> tags (Chain-of-Verification)
    output_match = re.search(r"<output>\s*([\s\S]*?)\s*</output>", content)
    if output_match:
        content = output_match.group(1).strip()

    # Take the LAST code block (for Chain-of-Verification), even if its closing fence is missing
    block = _last_fenced_block(content)
    return block if block is not None else content


def parse_json_response(content: str) -> Any:
    """Parse JSON from LLM response. Raises retryable ApplicationError if no JSON found."""
    extracted = extract_json(content)
    if not extracted or extracted.isspace():
        raise ApplicationError(
            "JSON parse error: Empty response after extraction",
            non_retryable=False,
        )
    result = json_repair_loads(extracted)
    if isinstance(result, str):
        raise ApplicationError(
            f"JSON parse error: No JSON object/array in response, got: {result[:100]}",
            non_retryable=False,
        )
    return result
