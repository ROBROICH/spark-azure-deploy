"""
Stage 1 and Stage 2 preparation functions for the PageIndex SVM pipeline.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import tiktoken
from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, sanitize_external_data
from temporal.contracts import (
    SucheZuordnungDocument as Document,
)
from temporal.contracts import (
    SucheZuordnungDocumentNode as DocumentNode,
)

from src.config import CONFIG
from src.pageindex_svm.prompts import STAGE1_USER_PROMPT, STAGE2_USER_PROMPT
from src.pageindex_svm.sentence_utils import format_chunks_with_sentences, split_into_sentences


@lru_cache(maxsize=1)
def _get_encoding() -> tiktoken.Encoding:
    """Return a cached tiktoken encoding for the configured truncation model."""
    return tiktoken.get_encoding(CONFIG.PAGEINDEX_SVM.TRUNCATION_ENCODING)


def count_tokens(text: str) -> int:
    """Count tokens in text using the configured truncation encoding."""
    return len(_get_encoding().encode(text))


def truncate_research_report(report: str, max_tokens: int | None = None) -> str:
    """Falls back to CONFIG.PAGEINDEX_SVM.STAGE2_RESEARCH_REPORT_MAX_TOKENS when max_tokens is None; appends a German truncation notice on cut."""
    if not report:
        return ""

    if max_tokens is None:
        max_tokens = CONFIG.PAGEINDEX_SVM.STAGE2_RESEARCH_REPORT_MAX_TOKENS

    encoding = _get_encoding()
    tokens = encoding.encode(report)

    if len(tokens) <= max_tokens:
        return report

    truncated_tokens = tokens[:max_tokens]
    truncated_text = encoding.decode(truncated_tokens)
    return truncated_text + "\n\n[... Report gekürzt ...]"


def create_node_mapping(nodes: list[DocumentNode]) -> dict[str, DocumentNode]:
    """Build a lookup dict from node_id to DocumentNode for O(1) access."""
    return {node.node_id: node for node in nodes}


def prepare_stage1(
    tree: Document,
    norm: str,
    tbm: str,
    research_report: str,
    max_input_tokens: int,
) -> tuple[str | None, dict[str, DocumentNode], dict[int, str]]:
    """Uses sequential integer node_ids in the prompt (easier for the LLM) instead of real UUIDs; progressively shortens summaries at 500/300/200 chars if the prompt exceeds max_input_tokens, returning None as the prompt if it still cannot fit."""
    node_map = create_node_mapping(tree.nodes)
    index_to_node_id: dict[int, str] = {}
    for idx, node in enumerate(tree.nodes):
        index_to_node_id[idx] = node.node_id

    truncated_research = truncate_research_report(research_report)
    summary_char_limits = [500, 300, 200]

    for limit in summary_char_limits:
        titles_and_summaries = []
        for idx, node in enumerate(tree.nodes):
            raw_summary = node.summary or node.text[:500]
            titles_and_summaries.append(
                {
                    "node_id": idx,
                    "title": node.title,
                    "summary": raw_summary[:limit],
                }
            )

        prompt = STAGE1_USER_PROMPT.format(
            tbm=sanitize_external_data(tbm),
            norm=sanitize_external_data(norm),
            tbm_research=truncated_research,
            titles=sanitize_and_wrap_external_data(json.dumps(titles_and_summaries, indent=2, ensure_ascii=False)),
        )

        if count_tokens(prompt) <= max_input_tokens:
            return prompt, node_map, index_to_node_id

    # Even with minimal summaries the prompt is too large — signal skip
    return None, node_map, index_to_node_id


def build_stage2_batches(
    chunks: list[dict[str, Any]],
) -> list[list[dict[str, Any]]]:
    """Group chunks into batches respecting token and chunk-count limits.

    Note: With MAX_CHUNKS_PER_BATCH=1 (current default), each chunk gets its
    own batch. The batching logic is kept for future multi-chunk batching.
    """
    available_tokens = CONFIG.PAGEINDEX_SVM.STAGE2_MAX_BATCH_TOKENS - CONFIG.PAGEINDEX_SVM.STAGE2_PROMPT_OVERHEAD
    batches: list[list[dict[str, Any]]] = []
    current_batch: list[dict[str, Any]] = []
    current_tokens = 0

    for chunk in chunks:
        chunk_tokens = chunk.get("tokens", 0)

        if chunk_tokens > available_tokens:
            if current_batch:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0
            batches.append([chunk])
            continue

        if (
            current_tokens + chunk_tokens <= available_tokens
            and len(current_batch) < CONFIG.PAGEINDEX_SVM.MAX_CHUNKS_PER_BATCH
        ):
            current_batch.append(chunk)
            current_tokens += chunk_tokens
        else:
            batches.append(current_batch)
            current_batch = [chunk]
            current_tokens = chunk_tokens

    if current_batch:
        batches.append(current_batch)
    return batches


def _split_node_into_chunks(nid: str, node: DocumentNode, max_chunk_tokens: int) -> list[dict[str, Any]]:
    """Split a node whose text exceeds max_chunk_tokens into sentence-boundary-aligned chunks."""
    sentences = split_into_sentences(node.text)
    current_text_parts: list[str] = []
    current_tokens = 0
    chunks_to_filter: list[dict[str, Any]] = []

    for sentence in sentences:
        sentence_tokens = count_tokens(sentence)
        if current_tokens + sentence_tokens > max_chunk_tokens and current_text_parts:
            joined = " ".join(current_text_parts)
            chunks_to_filter.append(
                {
                    "node_id": nid,
                    "title": node.title,
                    "text": joined,
                    "tokens": current_tokens,
                }
            )
            current_text_parts = []
            current_tokens = 0
        current_text_parts.append(sentence)
        current_tokens += sentence_tokens

    if current_text_parts:
        joined = " ".join(current_text_parts)
        chunks_to_filter.append(
            {
                "node_id": nid,
                "title": node.title,
                "text": joined,
                "tokens": current_tokens,
            }
        )

    return chunks_to_filter


def _identify_chunks_to_filter(selected_nodes: list[str], node_map: dict[str, DocumentNode]) -> list[dict[str, Any]]:
    """Convert selected nodes to filterable chunks, splitting oversized nodes at sentence boundaries."""
    max_chunk_tokens = CONFIG.PAGEINDEX_SVM.STAGE2_MAX_INPUT_TOKENS - CONFIG.PAGEINDEX_SVM.STAGE2_PROMPT_OVERHEAD

    chunks_to_filter: list[dict[str, Any]] = []

    for nid in selected_nodes:
        if nid not in node_map or not node_map[nid].text:
            continue
        node = node_map[nid]
        text_tokens = count_tokens(node.text)

        if text_tokens <= max_chunk_tokens:
            chunks_to_filter.append(
                {
                    "node_id": nid,
                    "title": node.title,
                    "text": node.text,
                    "tokens": text_tokens,
                }
            )
        else:
            # Split oversized node at sentence boundaries to fit context window
            chunks_to_filter.extend(_split_node_into_chunks(nid, node, max_chunk_tokens))

    return chunks_to_filter


def prepare_stage2(
    selected_nodes: list[str],
    node_map: dict[str, DocumentNode],
    norm: str,
    tbm: str,
    research_report: str,
) -> tuple[list[str], list[dict[str, list[str]]]]:
    """Splits oversized nodes at sentence boundaries before batching; nodes absent from node_map or with empty text are silently skipped."""
    truncated_research = truncate_research_report(
        research_report,
        max_tokens=CONFIG.PAGEINDEX_SVM.STAGE2_RESEARCH_REPORT_MAX_TOKENS,
    )

    chunks_to_filter: list[dict[str, Any]] = _identify_chunks_to_filter(selected_nodes, node_map)

    batches = build_stage2_batches(chunks_to_filter)

    prompts: list[str] = []
    batch_sentence_maps: list[dict[str, list[str]]] = []

    for batch in batches:
        chunks_formatted, sentence_maps = format_chunks_with_sentences(batch)
        prompt = STAGE2_USER_PROMPT.format(
            tbm=sanitize_external_data(tbm),
            norm=sanitize_external_data(norm),
            tbm_research=truncated_research,
            chunks_formatted=sanitize_and_wrap_external_data(chunks_formatted),
        )
        prompts.append(prompt)
        batch_sentence_maps.append(sentence_maps)

    return prompts, batch_sentence_maps
