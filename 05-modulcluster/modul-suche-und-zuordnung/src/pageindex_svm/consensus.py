"""
Consensus voting for Stage 1 of the PageIndex SVM pipeline.
"""

from __future__ import annotations

from collections import Counter

from src.config import CONFIG
from src.pageindex_svm.prompts import Stage1Response


def consensus_vote(results: list[Stage1Response]) -> dict[str, float]:
    """Keeps only nodes selected by at least CONSENSUS_THRESHOLD of the parallel LLM runs.

    Returns them in sorted order as an ID-to-vote-ratio mapping. The keys are the selection
    as strings for node_map lookup; the values are the share of runs that voted for each node.
    The ratio is contract-bound to [0, 1], so it is kept in range by construction.
    """
    vote_counts: Counter[int] = Counter()
    for result in results:
        # One run is one vote per node; the LLM may repeat a node_id.
        vote_counts.update(set(result.node_list))

    # Never below the delivered results, so extra results cannot overflow; never below the
    # configured runs, so a missing run lowers the ratio instead of inflating the survivors.
    runs = max(len(results), CONFIG.PAGEINDEX_SVM.CONSENSUS_RUNS)
    # Sorted by the string key, preserving the established lexicographic order.
    selected = sorted(
        (str(node_id), count)
        for node_id, count in vote_counts.items()
        if count >= CONFIG.PAGEINDEX_SVM.CONSENSUS_THRESHOLD
    )
    return {node_id: count / runs for node_id, count in selected}
