"""
Consensus voting for Stage 1 of the PageIndex SVM pipeline.
"""

from __future__ import annotations

from collections import Counter

from src.config import CONFIG
from src.pageindex_svm.prompts import Stage1Response


def consensus_vote(results: list[Stage1Response]) -> list[str]:
    """Keeps only nodes selected by at least CONSENSUS_THRESHOLD of the parallel LLM runs; returns IDs as strings for node_map lookup."""
    vote_counts: Counter[int] = Counter()
    for result in results:
        vote_counts.update(result.node_list)

    return sorted(
        str(node_id) for node_id, count in vote_counts.items() if count >= CONFIG.PAGEINDEX_SVM.CONSENSUS_THRESHOLD
    )
