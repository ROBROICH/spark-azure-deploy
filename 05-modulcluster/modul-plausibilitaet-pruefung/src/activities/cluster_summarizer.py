"""Non-LLM Temporal activity for graph-based clustering of inconsistency pairs.

The cluster-summarisation LLM call lives in workflow code; this module only
contains the deterministic graph clustering activity that prepares clusters
for summarisation.
"""

import math

import networkx as nx
from temporalio import activity

from src.config.config import config
from src.workflows.check_logic_wf.schemas.cluster_summarizer_schemas import (
    ClusteringInput,
    InconsistencyCluster,
    InconsistencyClusters,
)
from src.workflows.clients import qdrant_client


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


@activity.defn
async def build_clusters(clustering_input: ClusteringInput) -> InconsistencyClusters:
    """Cluster contradiction pairs by shared claim or semantic similarity of claims."""
    pairs = clustering_input.inconsistency_pairs
    project_id = clustering_input.project_id

    # Collect all unique claim IDs and fetch their vectors in one batch call.
    all_claim_ids = list({cid for pair in pairs for cid in (pair.claim_a_id, pair.claim_b_id)})
    claim_payloads = await qdrant_client.get_claim_payloads(
        project_id=project_id,
        claim_ids=all_claim_ids,
        with_vectors=True,
    )
    vectors: dict[str, list[float]] = {
        p.claim_metadata.claim_id: p.vector for p in claim_payloads if p.vector is not None
    }

    # Build a graph over pair indices: add edge when two pairs should be merged.
    graph = nx.Graph()
    threshold = config.SUMMARIZING.SIMILARITY_THRESHOLD
    for i, pair_a in enumerate(pairs):
        for j, pair_b in enumerate(pairs):
            if j <= i:
                continue
            claims_a = {pair_a.claim_a_id, pair_a.claim_b_id}
            claims_b = {pair_b.claim_a_id, pair_b.claim_b_id}

            should_merge = bool(claims_a & claims_b)  # shared claim

            if not should_merge:
                for cid_a in claims_a:
                    for cid_b in claims_b:
                        if cid_a in vectors and cid_b in vectors:
                            if _cosine_similarity(vectors[cid_a], vectors[cid_b]) >= threshold:
                                should_merge = True
                                break
                    if should_merge:
                        break

            if should_merge:
                graph.add_edge(i, j)

    # Isolated pairs must appear as single-node components.
    for i in range(len(pairs)):
        if i not in graph:
            graph.add_node(i)

    clusters = []
    for component in nx.connected_components(graph):  # type: ignore[attr-defined]
        # networkx node type is opaque (`_Node`); we know we put `int` indices in.
        cluster_pairs = [pairs[i] for i in sorted(component)]  # pyrefly: ignore[bad-index, bad-specialization]
        if config.SUMMARIZING.MAX_EDGES_PER_CLUSTER is not None:
            # Safety measure to prevent huge LLM inputs downstream.
            cluster_pairs = cluster_pairs[: config.SUMMARIZING.MAX_EDGES_PER_CLUSTER]
        clusters.append(
            InconsistencyCluster(
                edges=cluster_pairs,
            )
        )

    return InconsistencyClusters(clusters=clusters)
