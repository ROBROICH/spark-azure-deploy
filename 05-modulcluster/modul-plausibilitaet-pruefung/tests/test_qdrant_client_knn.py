"""Qdrant client tests for batched KNN query reshaping."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.qdrant.client import PlausibilityQdrantClient

from .conftest import make_claim_payload


def _bare_client() -> PlausibilityQdrantClient:
    return object.__new__(PlausibilityQdrantClient)


class TestKnnIdsAllClaimsBatched:
    @pytest.mark.asyncio
    async def test_reshapes_results_per_claim_and_query(self) -> None:
        client = _bare_client()
        claim_payloads = [make_claim_payload(claim_id="A"), make_claim_payload(claim_id="B")]
        queries_per_claim = [
            {"k_neighbors": 3},
            {"k_neighbors": 2},
        ]

        flat_responses = [
            SimpleNamespace(points=[
                SimpleNamespace(id="r-A-1-1", score=0.7),
                SimpleNamespace(id="r-A-1-2", score=0.99),
            ]),
            SimpleNamespace(points=[SimpleNamespace(id="r-A-2-1", score=0.6)]),
            SimpleNamespace(points=[SimpleNamespace(id="r-B-1-1", score=0.8)]),
            SimpleNamespace(points=[
                SimpleNamespace(id="r-B-2-1", score=None),
            ]),
        ]
        client.query_batch_points = AsyncMock(return_value=flat_responses)  # type: ignore[method-assign]

        result = await client.get_claim_knn_ids_all_claims_batched(
            project_id="p",
            claim_payloads=claim_payloads,
            chunk_payloads_by_id={},
            queries_per_claim=queries_per_claim,
            batch_size=10,
            score_lower_threshold=0.5,
            score_upper_threshold=0.95,
        )

        assert result == [
            [["r-A-1-1"], ["r-A-2-1"]],
            [["r-B-1-1"], []],
        ]

    @pytest.mark.asyncio
    async def test_respects_batch_size(self) -> None:
        client = _bare_client()
        claim_payloads = [make_claim_payload(claim_id=f"C{i}") for i in range(3)]
        queries_per_claim = [{"k_neighbors": 1}]
        batches_received: list[int] = []

        async def fake_query_batch_points(
            *, collection_name: str, requests: list[Any]
        ) -> list[Any]:
            batches_received.append(len(requests))
            return [SimpleNamespace(points=[]) for _ in requests]

        client.query_batch_points = AsyncMock(side_effect=fake_query_batch_points)  # type: ignore[method-assign]

        await client.get_claim_knn_ids_all_claims_batched(
            project_id="p",
            claim_payloads=claim_payloads,
            chunk_payloads_by_id={},
            queries_per_claim=queries_per_claim,
            batch_size=2,
        )

        assert batches_received == [2, 1]
