"""JSON extraction and parsing from LLM responses."""

from __future__ import annotations

import re
from typing import Any

from json_repair import loads as json_repair_loads
from temporalio.exceptions import ApplicationError


def extract_json(content: str) -> str:
    """Extract relevant JSON text from an LLM response.

    Supports:
    - <output>...</output> tags (Chain-of-Verification)
    - ```json ... ``` Markdown code blocks (takes the LAST block)
    """
    content = content.strip()

    # Extract from <output> tags (Chain-of-Verification)
    output_match = re.search(r"<output>\s*([\s\S]*?)\s*</output>", content)
    if output_match:
        content = output_match.group(1).strip()

    # Find the LAST ```json block (for Chain-of-Verification)
    json_blocks = list(re.finditer(r"```json\s*([\s\S]*?)```", content))
    if json_blocks:
        content = json_blocks[-1].group(1).strip()
    else:
        code_blocks = list(re.finditer(r"```\s*([\s\S]*?)```", content))
        if code_blocks:
            content = code_blocks[-1].group(1).strip()

    return content


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
