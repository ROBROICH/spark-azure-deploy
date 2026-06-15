"""Pure helper functions for PII extraction — prompt building and result merging."""

import logging
from typing import Iterable, Mapping

from prompt_injection.prompt_defense import render_prompt_format
from pydantic import BaseModel

from src.prompts.pii_extraction import PII_EXTRACTION_USER_PROMPT, PII_FILTER_USER_PROMPT

logger = logging.getLogger(__name__)

TRUNCATION_MSG = "\n... [truncated] ...\n"


def truncate_prompt(prompt: str, max_size: int) -> str:
    """Truncate an oversized prompt symmetrically, keeping its head and tail."""
    max_len = max_size - len(TRUNCATION_MSG)
    if len(prompt) > max_len:
        logger.warning(
            "Prompt truncated from %d to %d characters (max_size=%d)",
            len(prompt),
            max_size,
            max_size,
        )
        half = max_len // 2
        return prompt[:half] + TRUNCATION_MSG + prompt[-half:]
    return prompt


PAGE_SEPARATOR = "\n\n=== SEITE {page_number} ===\n\n"


def build_multi_page_prompt(
    pages: list[tuple[int, list[str]]],
    max_prompt_size: int = 300000,
) -> str:
    """Combine multiple (page_number, page_lines) pages into one PII extraction prompt, separated by page markers."""
    sections: list[str] = []
    for page_number, page_lines in pages:
        non_empty_lines = [line for line in page_lines if line.strip()]
        if not non_empty_lines:
            continue
        text = " ".join(non_empty_lines)
        sections.append(PAGE_SEPARATOR.format(page_number=page_number) + text)
    combined = "".join(sections)
    prompt = render_prompt_format(PII_EXTRACTION_USER_PROMPT, chunk=combined)
    return truncate_prompt(prompt, max_prompt_size)


class PiiItem(BaseModel):
    """A single PII term extracted by the LLM."""

    text: str
    kategorie: str = ""


class PiiResponseSchema(BaseModel):
    """Validated schema for PII extraction LLM output."""

    items: list[PiiItem]

    def to_terms(self) -> list[str]:
        """Extract deduplicated non-empty text terms."""
        return [item.text for item in self.items if item.text.strip()]


def merge_page_pii(
    *sources: Mapping[int, Iterable[str]],
) -> dict[int, set[str]]:
    """Union PII terms from multiple per-page detection sources.

    The result contains every page seen in any source, with terms deduplicated.
    Empty sources (e.g. when the LLM path is disabled) are handled cleanly.
    """
    merged: dict[int, set[str]] = {}
    for source in sources:
        for page_number, terms in source.items():
            merged.setdefault(page_number, set()).update(terms)
    return merged


def build_filter_prompt(candidates: Iterable[str], max_prompt_size: int = 300000) -> str:
    """Build a single LLM prompt asking the model to filter PII candidates.

    Candidates are emitted as a bullet list, then truncated to fit the prompt
    budget (deduplicated lists are typically < 1000 items, well below it).
    """
    listing = "\n".join(f"- {term}" for term in candidates)
    prompt = render_prompt_format(PII_FILTER_USER_PROMPT, candidates=listing)
    return truncate_prompt(prompt, max_prompt_size)
