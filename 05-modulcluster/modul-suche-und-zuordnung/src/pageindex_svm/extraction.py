"""
Result building and text extraction for the PageIndex SVM pipeline.
"""

from __future__ import annotations

from temporal.contracts import (
    SucheZuordnungDocumentNode as DocumentNode,
)
from temporal.contracts import (
    SucheZuordnungPageIndexSVMEntry as PageIndexSVMEntry,
)
from temporal.contracts import (
    SucheZuordnungPageIndexSVMResult as PageIndexSVMResult,
)

from src.pageindex_svm.prompts import Stage2SentenceResponse
from src.pageindex_svm.sentence_utils import reconstruct_from_indices


def combine_confidence(consensus_ratio: float | None, relevance: float | None) -> float | None:
    """Relevance discounted by the consensus rate; the remaining signal alone when one is missing, and None when both are.

    Not an average: the consensus rate never falls below CONSENSUS_THRESHOLD /
    CONSENSUS_RUNS, so averaging let it raise a passage the prompt itself classes
    as carrying nothing. Multiplying lets agreement discount relevance but never
    substitute for it.
    """
    if consensus_ratio is None:
        return relevance
    if relevance is None:
        return consensus_ratio
    return consensus_ratio * relevance


def build_result(
    selected_nodes: list[str],
    stage2_results: list[Stage2SentenceResponse],
    batch_sentence_maps: list[dict[str, list[str]]],
    node_map: dict[str, DocumentNode],
    document_id: str,
    consensus_ratios: dict[str, float] | None = None,
) -> PageIndexSVMResult:
    """Nodes missing from node_map or filtered_chunks are silently dropped; nodes split across batches have their filtered text concatenated and their present relevance values averaged."""
    ratios = consensus_ratios or {}
    # Merge all batch results into a single {node_id: filtered_text} dict
    filtered_chunks: dict[str, str] = {}
    relevance_parts: dict[str, list[float]] = {}
    for response, sentence_maps in zip(stage2_results, batch_sentence_maps, strict=True):
        for chunk_result in response.results:
            node_id = chunk_result.node_id
            if node_id not in sentence_maps:
                continue
            sentences = sentence_maps[node_id]
            text = reconstruct_from_indices(sentences, chunk_result.relevant_indices)
            if node_id in filtered_chunks:
                # Same node split across multiple batches — concatenate results
                filtered_chunks[node_id] = filtered_chunks[node_id] + " " + text
            else:
                filtered_chunks[node_id] = text
            # Collected per node; a node split across batches contributes one value per
            # batch. A batch without a relevance value contributes nothing.
            if chunk_result.relevance is not None:
                relevance_parts.setdefault(node_id, []).append(chunk_result.relevance)

    # Build output entries
    entries: list[PageIndexSVMEntry] = []
    for node_id in selected_nodes:
        if node_id not in node_map or node_id not in filtered_chunks:
            continue
        node = node_map[node_id]
        parts = relevance_parts.get(node_id) or []
        relevance = sum(parts) / len(parts) if parts else None
        consensus_ratio = ratios.get(node_id)
        entries.append(
            PageIndexSVMEntry(
                node_id=node_id,
                document_id=document_id,
                title=node.title,
                text=filtered_chunks[node_id],
                chunk_ids=node.chunk_ids,
                page_numbers=node.page_numbers,
                consensus_ratio=consensus_ratio,
                relevance=relevance,
                confidence=combine_confidence(consensus_ratio, relevance),
            )
        )

    return PageIndexSVMResult(originaltexte=entries)
