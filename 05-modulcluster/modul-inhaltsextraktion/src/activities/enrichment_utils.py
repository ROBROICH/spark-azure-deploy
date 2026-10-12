# src/activities/enrichment_utils.py
"""
Shared utility functions for chunk enrichment activities.
"""

import asyncio
import re
from collections.abc import Awaitable, Callable
from typing import Any

from temporalio import workflow

from src.schemas import Chunk

_BILD_PATTERN = re.compile(r"<BILD[^>]*>(.*?)</BILD>", re.DOTALL)
_TABELLE_PATTERN = re.compile(r"<TABELLE[^>]*>(.*?)</TABELLE>", re.DOTALL)

SECTION_FALLBACK = "Nicht verfügbar"


def extract_table_text(html_content: str) -> str:
    """Extract readable text from HTML table by removing tags."""
    text = re.sub(r"<[^>]+>", " ", html_content)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 500:
        text = text[:500] + "..."
    return text


def _tag_text(inner: str, tag: str) -> str:
    match = re.search(rf"<{tag}>(.*?)</{tag}>", inner, re.DOTALL)
    return match.group(1).strip() if match else ""


def _bild_plain(match: re.Match[str]) -> str:
    return _tag_text(match.group(1), "summary")


def _tabelle_plain(match: re.Match[str]) -> str:
    inner = match.group(1)
    return _tag_text(inner, "summary") or extract_table_text(inner)


def _bild_labelled(match: re.Match[str]) -> str:
    inner = match.group(1)
    text = _tag_text(inner, "summary") or _tag_text(inner, "description") or _tag_text(inner, "caption_text")
    return f"[Bild: {text}]" if text else "[Bild]"


def _tabelle_labelled(match: re.Match[str]) -> str:
    inner = match.group(1)
    summary = _tag_text(inner, "summary")
    if summary:
        return f"[Tabelle: {summary}]"

    table_text = extract_table_text(inner)
    caption = _tag_text(inner, "caption_text")
    if caption:
        if table_text:
            return f"[Tabelle '{caption}': {table_text}]"
        return f"[Tabelle: {caption}]"

    if table_text:
        return f"[Tabelle: {table_text}]"
    return "[Tabelle]"


def clean_enrichment_content(content: str, *, labelled: bool = False) -> str:
    if labelled:
        content = _BILD_PATTERN.sub(_bild_labelled, content)
        return _TABELLE_PATTERN.sub(_tabelle_labelled, content)
    content = _BILD_PATTERN.sub(_bild_plain, content)
    return _TABELLE_PATTERN.sub(_tabelle_plain, content)


def build_chunks_text(
    chunks: list[Chunk],
    *,
    heading: str,
    include_section: bool = True,
    labelled: bool = False,
) -> str:
    snippet_parts: list[str] = []
    for i, chunk in enumerate(chunks):
        cleaned_content = clean_enrichment_content(chunk.page_content, labelled=labelled)
        if include_section:
            aktueller_abschnitt = chunk.metadata.get("toc_path", SECTION_FALLBACK)
            snippet_parts.append(
                f"--- {heading} {i + 1} ---\n"
                f"**Aktueller Abschnitt:** {aktueller_abschnitt}\n\n"
                f'**Text:** "{cleaned_content}"'
            )
        else:
            snippet_parts.append(f"--- {heading} {i + 1} ---\n{cleaned_content}")
    return "\n\n".join(snippet_parts)


async def _invoke_with_single_fallback[R](
    chunks: list[Chunk],
    invoke: Callable[[list[Chunk]], Awaitable[list[R]]],
    empty_result: Callable[[], R],
    label: str,
) -> list[R]:
    results = await invoke(chunks)
    if len(results) == len(chunks):
        return list(results)

    workflow.logger.warning(
        "Batched %s returned %d results for %d chunks, falling back to individual processing",
        label,
        len(results),
        len(chunks),
    )
    individual_results: list[R] = []
    for chunk in chunks:
        single = await invoke([chunk])
        individual_results.append(single[0] if single else empty_result())
    return individual_results


async def run_batched_enrichment[R](
    chunks: list[Chunk],
    *,
    batch_size: int,
    invoke: Callable[[list[Chunk]], Awaitable[list[R]]],
    empty_result: Callable[[], R],
    label: str,
) -> list[R]:
    sub_batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]
    sub_batch_results = await asyncio.gather(
        *[_invoke_with_single_fallback(sub_batch, invoke, empty_result, label) for sub_batch in sub_batches]
    )
    results: list[R] = []
    for sub_result in sub_batch_results:
        results.extend(sub_result)
    return results


def with_metadata(chunk: Chunk, updates: dict[str, Any]) -> Chunk:
    updated_sub_chunks = [
        sub_chunk.model_copy(update={"metadata": {**sub_chunk.metadata, **updates}}) for sub_chunk in chunk.sub_chunks
    ]
    return chunk.model_copy(update={"metadata": {**chunk.metadata, **updates}, "sub_chunks": updated_sub_chunks})
