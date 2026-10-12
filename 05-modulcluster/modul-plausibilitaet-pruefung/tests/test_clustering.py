"""Unit tests for clustering inconsistency pairs into connected components."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.clustering import _cosine_similarity, build_clusters
from src.qdrant.schemas import ClaimPayload
from src.workflows.check_logic_wf.schemas.clustering_schemas import (
    ClusteringInput,
)

from .conftest import make_claim_payload, make_inconsistency_pair


class TestCosineSimilarity:
    def test_zero_vector_returns_zero_similarity(self) -> None:
        assert _cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


def _make_clustering_input(
    pairs: list[tuple[str, str]],
    project_id: str = "proj-1",
    document_id: str = "doc-1",
) -> ClusteringInput:
    """Build a ClusteringInput from a list of (chunk_a_id, chunk_b_id) tuples.

    Claim IDs are derived from chunk IDs so that pairs sharing a chunk also share
    a claim, which drives merging into the same cluster.
    """
    return ClusteringInput(
        project_id=project_id,
        document_id=document_id,
        inconsistency_pairs=[
            make_inconsistency_pair(
                chunk_a_id=a,
                chunk_b_id=b,
                claim_a_id=f"claim-{a}",
                claim_b_id=f"claim-{b}",
            )
            for a, b in pairs
        ],
    )


class TestBuildClusters:
    """Tests for the graph-based clustering of inconsistency pairs."""

    @pytest.fixture(autouse=True)
    def mock_qdrant(self) -> Generator[MagicMock]:
        """Prevent real Qdrant calls; return no vectors so only shared-claim merging applies."""
        with patch("src.activities.clustering.qdrant_client") as mock:
            mock.get_claim_payloads = AsyncMock(return_value=list[ClaimPayload]())
            yield mock

    @pytest.mark.asyncio
    async def test_single_connected_component(self) -> None:
        """Three edges forming one component produce exactly one cluster."""
        inp = _make_clustering_input([("A", "B"), ("B", "C"), ("C", "A")])

        result = await build_clusters(inp)

        assert len(result.clusters) == 1
        assert len(result.clusters[0].edges) == 3  # noqa: PLR2004

    @pytest.mark.asyncio
    async def test_two_disconnected_components(self) -> None:
        """Two separate edge groups produce two clusters."""
        inp = _make_clustering_input([("A", "B"), ("C", "D")])

        result = await build_clusters(inp)

        assert len(result.clusters) == 2  # noqa: PLR2004
        cluster_node_sets = []
        for cluster in result.clusters:
            nodes = set()
            for edge in cluster.edges:
                nodes.add(edge.chunk_a_id)
                nodes.add(edge.chunk_b_id)
            cluster_node_sets.append(nodes)
        assert {"A", "B"} in cluster_node_sets
        assert {"C", "D"} in cluster_node_sets

    @pytest.mark.asyncio
    async def test_vector_similarity_merges_pairs_without_shared_claims(self, mock_qdrant: MagicMock) -> None:
        inp = _make_clustering_input([("A", "B"), ("C", "D")])
        mock_qdrant.get_claim_payloads = AsyncMock(
            return_value=[
                make_claim_payload(claim_id="claim-A", vector=[0.0, 1.0]),
                make_claim_payload(claim_id="claim-B", vector=[1.0, 0.0]),
                make_claim_payload(claim_id="claim-C", vector=[1.0, 0.0]),
                make_claim_payload(claim_id="claim-D", vector=[0.0, 1.0]),
            ]
        )

        result = await build_clusters(inp)

        assert len(result.clusters) == 1
        assert len(result.clusters[0].edges) == 2  # noqa: PLR2004

    @pytest.mark.asyncio
    async def test_large_clusters_are_not_truncated(self) -> None:
        """Clusters are carried in full — truncation silently dropped confirmed edges."""
        nodes = ["A", "B", "C", "D", "E"]
        pairs = [(a, b) for i, a in enumerate(nodes) for b in nodes[i + 1 :]]
        inp = _make_clustering_input(pairs)

        result = await build_clusters(inp)

        assert len(result.clusters) == 1
        assert len(result.clusters[0].edges) == len(pairs)
