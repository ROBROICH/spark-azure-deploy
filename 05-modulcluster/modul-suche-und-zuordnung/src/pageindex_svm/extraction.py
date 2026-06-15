"""
Result building and text extraction for the PageIndex SVM pipeline.
"""

from __future__ import annotations

from temporal.workflows.modul_suche_und_zuordnung.types import DocumentNode, PageIndexSVMEntry, PageIndexSVMResult

from src.pageindex_svm.prompts import Stage2SentenceResponse
from src.pageindex_svm.sentence_utils import reconstruct_from_indices


def build_result(
    selected_nodes: list[str],
    stage2_results: list[Stage2SentenceResponse],
    batch_sentence_maps: list[dict[str, list[str]]],
    node_map: dict[str, DocumentNode],
    document_id: str,
) -> PageIndexSVMResult:
    """Nodes missing from node_map or filtered_chunks are silently dropped; nodes split across batches have their filtered text concatenated."""
    # Merge all batch results into a single {node_id: filtered_text} dict
    filtered_chunks: dict[str, str] = {}
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

    # Build output entries
    entries: list[PageIndexSVMEntry] = []
    for node_id in selected_nodes:
        if node_id not in node_map or node_id not in filtered_chunks:
            continue
        node = node_map[node_id]
        entries.append(
            PageIndexSVMEntry(
                node_id=node_id,
                document_id=document_id,
                title=node.title,
                text=filtered_chunks[node_id],
                chunk_ids=node.chunk_ids,
                page_numbers=node.page_numbers,
            )
        )

    return PageIndexSVMResult(originaltexte=entries)
