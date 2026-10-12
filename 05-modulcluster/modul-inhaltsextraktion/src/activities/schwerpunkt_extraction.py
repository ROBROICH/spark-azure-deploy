# src/activities/schwerpunkt_extraction.py
"""
Temporal activities for Schwerpunktthema extraction.

Architecture:
- process_schwerpunkt_batch: Classifies a batch of chunks by topic with batched LLM
  calls (see enrichment_utils.run_batched_enrichment).
"""

from dataclasses import dataclass

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured

from src.activities.enrichment_utils import build_chunks_text, run_batched_enrichment, with_metadata
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

_TOPICS_BY_ID = {t["id"]: t for t in TOPICS}

_UNSICHER_TOPIC_ID = -1


def _resolve_topic_name(topic_id: int) -> str:
    """Map a topic ID to its display name."""
    if topic_id == _UNSICHER_TOPIC_ID:
        return "Unsicher"
    topic = _TOPICS_BY_ID.get(topic_id)
    if not topic:
        return "Invalid ID"
    return str(topic["name"])


async def _classify_chunks(chunks: list[Chunk]) -> list[int]:
    alle_unterkapitel = chunks[0].metadata.get("all_subchapters", [])
    unterkapitel_text = "\n".join(f"- {kapitel}" for kapitel in alle_unterkapitel)

    result = await llm_invoke_structured(
        render_prompt_format(
            BATCHED_CLASSIFIER_USER_TEMPLATE,
            unterkapitel_text=unterkapitel_text,
            themenliste_text=_THEMENLISTE_TEXT,
            chunks_text=build_chunks_text(chunks, heading="Textausschnitt"),
        ),
        wrap_system_prompt(BATCHED_CLASSIFIER_SYSTEM_PROMPT),
        BatchedClassificationResponse,
        model=ENV.SCHWERPUNKTTHEMA_MODEL_NAME,
        temperature=0.1,
    )
    return [c.topic_id for c in result.classifications]


@dataclass
class ProcessSchwerpunktBatchInput:
    """Input for Schwerpunkt batch processing."""

    chunks: list[Chunk]


async def process_schwerpunkt_batch(
    input: ProcessSchwerpunktBatchInput,
) -> list[Chunk]:
    """Classify a batch of chunks by topic using batched LLM calls."""
    cfg = get_config()
    topic_ids = await run_batched_enrichment(
        input.chunks,
        batch_size=cfg.SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE,
        invoke=_classify_chunks,
        empty_result=lambda: _UNSICHER_TOPIC_ID,
        label="classification",
    )
    return [
        with_metadata(chunk, SchwerpunktMetadata(focus_topic=_resolve_topic_name(topic_id)).model_dump())
        for chunk, topic_id in zip(input.chunks, topic_ids, strict=True)
    ]
