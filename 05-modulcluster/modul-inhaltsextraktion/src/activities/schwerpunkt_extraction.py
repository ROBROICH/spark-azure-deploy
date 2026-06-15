# src/activities/schwerpunkt_extraction.py
"""
Temporal activities for Schwerpunktthema extraction.

Architecture:
- _process_schwerpunkt_batch: Processes a batch of chunks with batched classification
"""

import asyncio
import re
from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporalio import workflow

from src.config import get_config
from src.env import ENV
from src.schemas import Chunk
from src.workflows.schwerpunkt.output_format import (
    BatchedClassificationResponse,
    SchwerpunktMetadata,
)
from src.workflows.schwerpunkt.prompt import (
    BATCHED_CLASSIFIER_SYSTEM_PROMPT,
    BATCHED_CLASSIFIER_USER_TEMPLATE,
)
from src.workflows.schwerpunkt.topics import TOPICS

# Module-level constants
_THEMENLISTE_TEXT = "\n\n".join(
    f"- ID: {t['id']}\n  Thema: {t['name']}\n  Beschreibung: {t['description']}" for t in TOPICS
)


def _clean_content_for_schwerpunktthema(content: str) -> str:
    """
    Cleans markdown content for the Schwerpunktthema classifier by replacing
    BILD and TABELLE blocks with only their summary tags.
    """
    from src.activities.enrichment_utils import extract_table_text

    def _extract_summary(match: re.Match[str], summary_tag: str) -> str:
        inner = match.group(1)
        summary_match = re.search(rf"<{summary_tag}>(.*?)</{summary_tag}>", inner, re.DOTALL)
        return summary_match.group(1) if summary_match else ""

    content = re.sub(
        r"<BILD[^>]*>(.*?)</BILD>",
        lambda m: _extract_summary(m, "summary"),
        content,
        flags=re.DOTALL,
    )
    content = re.sub(
        r"<TABELLE[^>]*>(.*?)</TABELLE>",
        lambda m: (_extract_summary(m, "summary") or extract_table_text(m.group(1))),
        content,
        flags=re.DOTALL,
    )
    return content


_TOPICS_BY_ID = {t["id"]: t for t in TOPICS}


def _resolve_topic_name(topic_id: int) -> str:
    """Map a topic ID to its display name."""
    if topic_id == -1:
        return "Unsicher"
    topic = _TOPICS_BY_ID.get(topic_id)
    if not topic:
        return "Invalid ID"
    return str(topic["name"])


async def _classify_single_chunk(chunk: Chunk) -> str:
    """Classify a single chunk individually (fallback for batch mismatch)."""
    alle_unterkapitel = chunk.metadata.get("all_subchapters", [])
    unterkapitel_text = "\n".join(f"- {kapitel}" for kapitel in alle_unterkapitel)
    cleaned_content = _clean_content_for_schwerpunktthema(chunk.page_content)
    aktueller_abschnitt = chunk.metadata.get("toc_path", "Nicht verfügbar")

    single_result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_CLASSIFIER_USER_TEMPLATE,
            unterkapitel_text=unterkapitel_text,
            themenliste_text=_THEMENLISTE_TEXT,
            chunks_text=(
                f"--- Textausschnitt 1 ---\n"
                f"**Aktueller Abschnitt:** {aktueller_abschnitt}\n\n"
                f'**Text:** "{cleaned_content}"'
            ),
        ),
        wrap_system_prompt(BATCHED_CLASSIFIER_SYSTEM_PROMPT),
        BatchedClassificationResponse,
        model=ENV.SCHWERPUNKTTHEMA_MODEL_NAME,
        temperature=0.1,
    )
    c = single_result.classifications[0] if single_result.classifications else type("C", (), {"topic_id": -1})()
    return _resolve_topic_name(c.topic_id)


async def _classify_chunk_batch(
    chunks: list[Chunk],
) -> list[str]:
    """Classify multiple chunks in a single LLM call. Returns list of topic names.

    Errors propagate to let Temporal retry the activity.
    """
    alle_unterkapitel = chunks[0].metadata.get("all_subchapters", [])
    unterkapitel_text = "\n".join(f"- {kapitel}" for kapitel in alle_unterkapitel)

    snippet_parts = []
    for i, chunk in enumerate(chunks):
        cleaned_content = _clean_content_for_schwerpunktthema(chunk.page_content)
        aktueller_abschnitt = chunk.metadata.get("toc_path", "Nicht verfügbar")
        snippet_parts.append(
            f"--- Textausschnitt {i + 1} ---\n"
            f"**Aktueller Abschnitt:** {aktueller_abschnitt}\n\n"
            f'**Text:** "{cleaned_content}"'
        )
    chunks_text = "\n\n".join(snippet_parts)

    result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_CLASSIFIER_USER_TEMPLATE,
            unterkapitel_text=unterkapitel_text,
            themenliste_text=_THEMENLISTE_TEXT,
            chunks_text=chunks_text,
        ),
        wrap_system_prompt(BATCHED_CLASSIFIER_SYSTEM_PROMPT),
        BatchedClassificationResponse,
        model=ENV.SCHWERPUNKTTHEMA_MODEL_NAME,
        temperature=0.1,
    )

    if len(result.classifications) == len(chunks):
        return [_resolve_topic_name(c.topic_id) for c in result.classifications]

    # Count mismatch — fall back to individual processing
    workflow.logger.warning(
        "Batched classification returned %d results for %d chunks, falling back to individual processing",
        len(result.classifications),
        len(chunks),
    )
    individual_results: list[str] = []
    for chunk in chunks:
        individual_results.append(await _classify_single_chunk(chunk))
    return individual_results


@dataclass
class ProcessSchwerpunktBatchInput:
    """Input for Schwerpunkt batch processing."""

    chunks: list[Chunk]


async def _process_schwerpunkt_batch(
    input: ProcessSchwerpunktBatchInput,
) -> list[Chunk]:
    """Classify a batch of chunks by topic using batched LLM calls."""
    cfg = get_config()
    chunks = input.chunks
    classification_batch_size = cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE

    # 1. Build sub-batches (groups of N chunks) for classification
    sub_batches = [chunks[i : i + classification_batch_size] for i in range(0, len(chunks), classification_batch_size)]

    # 2. Run all classification batches in parallel.
    classification_tasks = [_classify_chunk_batch(batch) for batch in sub_batches]

    all_results = await asyncio.gather(*classification_tasks)

    # 3. Flatten classification results into per-chunk topic names
    topic_names: list[str] = []
    for result in all_results:
        topic_names.extend(result)

    # 4. Apply metadata to chunks
    for j, chunk in enumerate(chunks):
        metadata = SchwerpunktMetadata(focus_topic=topic_names[j])
        chunk.metadata.update(metadata.model_dump())
        for sub_chunk in chunk.sub_chunks:
            sub_chunk.metadata.update(metadata.model_dump())

    return chunks


async def process_schwerpunkt_batch(
    input: ProcessSchwerpunktBatchInput,
    num_concurrent_batches: int = 1,
) -> list[Chunk]:
    """Workflow wrapper for direct-chunks Schwerpunkt batch processing."""
    return await _process_schwerpunkt_batch(input)
