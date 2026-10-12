"""Tests for risk-screener Temporal activities (non-LLM data prep)."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.risk_screener import (
    build_screening_bundles_for_document,
    fetch_screening_payloads_batch,
)
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleRequest,
    FetchScreeningPayloadsBatchInput,
    GroupedScreeningBundle,
    ScreeningCandidateBundle,
)

from .conftest import make_chunk_payload, make_claim_payload


def _claim_payload(
    claim_id: str = "claim-1",
    chunk_id: str = "chunk-1",
    document_id: str = "d",
) -> object:
    return make_claim_payload(
        claim_id=claim_id,
        chunk_id=chunk_id,
        project_id="p",
        document_id=document_id,
        claim_text=f"text-{claim_id}",
        vector=[0.1] * 8,
    )


def _chunk_payload(chunk_id: str = "chunk-1") -> object:
    return make_chunk_payload(
        chunk_id=chunk_id,
        project_id="p",
        document_id="d",
        chunk_content="content",
        toc_path=["S"],
    )


class TestBuildScreeningBundlesForDocument:
    @pytest.fixture
    def mock_qdrant(self) -> Generator[MagicMock]:
        with patch("src.activities.risk_screener.qdrant_client") as mock:
            yield mock

    @pytest.mark.asyncio
    async def test_empty_claim_ids_returns_no_bundles(self, mock_qdrant: MagicMock) -> None:
        result = await build_screening_bundles_for_document(
            DocumentBundleRequest(project_id="p", document_id="d", claim_ids=[])
        )
        assert result.bundles == []

    @pytest.mark.asyncio
    async def test_builds_bundle_per_claim(self, mock_qdrant: MagicMock) -> None:
        claim_payloads = [
            _claim_payload(claim_id="A", chunk_id="c1"),
            _claim_payload(claim_id="B", chunk_id="c2"),
        ]
        mock_qdrant.get_claim_payloads = AsyncMock(return_value=claim_payloads)
        mock_qdrant.get_chunk_payloads = AsyncMock(return_value=[_chunk_payload("c1"), _chunk_payload("c2")])
        # 3 query specs per claim → returns shape [claim_idx][query_idx]
        mock_qdrant.get_claim_knn_batched = AsyncMock(
            return_value=[
                [(["ref-erl-A"], []), (["ref-loc-A"], []), (["ref-rem-A"], ["dup-A"])],
                [(["ref-erl-B"], []), (["ref-loc-B"], []), (["ref-rem-B"], [])],
            ]
        )

        result = await build_screening_bundles_for_document(
            DocumentBundleRequest(project_id="p", document_id="d", claim_ids=["A", "B"])
        )

        assert len(result.bundles) == 2  # noqa: PLR2004
        assert result.overflow_pairs == [("A", "dup-A")]
        assert {b.claim_id for b in result.bundles} == {"A", "B"}
        for b in result.bundles:
            assert b.reference_claims  # at least one ref each

    @pytest.mark.asyncio
    async def test_preserves_input_claim_order(self, mock_qdrant: MagicMock) -> None:
        # Qdrant may return out of order; ordered_claim_payloads must preserve request order.
        claim_payloads = [
            _claim_payload(claim_id="B", chunk_id="c2"),
            _claim_payload(claim_id="A", chunk_id="c1"),
        ]
        mock_qdrant.get_claim_payloads = AsyncMock(return_value=claim_payloads)
        mock_qdrant.get_chunk_payloads = AsyncMock(return_value=[_chunk_payload("c1"), _chunk_payload("c2")])
        mock_qdrant.get_claim_knn_batched = AsyncMock(
            return_value=[
                [([], []), ([], []), (["x"], [])],
                [([], []), ([], []), (["y"], [])],
            ]
        )

        result = await build_screening_bundles_for_document(
            DocumentBundleRequest(project_id="p", document_id="d", claim_ids=["A", "B"])
        )

        assert [b.claim_id for b in result.bundles] == ["A", "B"]


class TestFetchScreeningPayloadsBatch:
    @pytest.mark.asyncio
    async def test_returns_dict_keyed_by_claim_id(self) -> None:
        with patch("src.activities.risk_screener.qdrant_client") as mock_qdrant:
            mock_qdrant.get_claim_payloads = AsyncMock(
                return_value=[
                    _claim_payload(claim_id="A", chunk_id="c1"),
                    _claim_payload(claim_id="R1", chunk_id="cR1"),
                    _claim_payload(claim_id="R2", chunk_id="cR2"),
                ]
            )

            request = FetchScreeningPayloadsBatchInput(
                project_id="p",
                bundles=[
                    GroupedScreeningBundle(
                        project_id="p",
                        document_id="d",
                        bundles=[
                            ScreeningCandidateBundle(
                                project_id="p",
                                document_id="d",
                                chunk_id="c1",
                                claim_id="A",
                                reference_claims=["R1", "R2"],
                            ),
                        ],
                    ),
                ],
            )

            result = await fetch_screening_payloads_batch(request)

            assert set(result.keys()) == {"A", "R1", "R2"}
            assert result["A"].claim_text == "text-A"
            # All unique claim ids passed to qdrant exactly once.
            mock_qdrant.get_claim_payloads.assert_awaited_once()
            payload_call = mock_qdrant.get_claim_payloads.await_args
            assert payload_call is not None
            kwargs = payload_call.kwargs
            assert sorted(kwargs["claim_ids"]) == ["A", "R1", "R2"]
            assert kwargs["with_vectors"] is False
