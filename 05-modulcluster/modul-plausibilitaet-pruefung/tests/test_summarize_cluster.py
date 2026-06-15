"""Unit tests for the workflow-level ``_summarize_cluster`` helper."""

import logging
from typing import Any
from unittest.mock import AsyncMock

import pytest

import src.workflows.check_logic_wf.single_document_workflow as module
from src.workflows.check_logic_wf.schemas.cluster_summarizer_schemas import (
    InconsistencyCluster,
    InconsistencySummaryLLMResponse,
    NodeStance,
)

from .conftest import make_inconsistency_pair


@pytest.fixture(autouse=True)
def _patch_workflow_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    """Workflow logger requires a workflow runtime; substitute a plain logger."""
    monkeypatch.setattr(module.workflow, "logger", logging.getLogger("test"))


def _make_cluster() -> InconsistencyCluster:
    """Cluster with three pairs over four chunks → node indices 0..3."""
    return InconsistencyCluster(
        edges=[
            make_inconsistency_pair(
                chunk_a_id="chunk-A",
                chunk_b_id="chunk-B",
                chunk_a_document_id="doc-A",
                chunk_b_document_id="doc-B",
            ),
            make_inconsistency_pair(
                chunk_a_id="chunk-B",
                chunk_b_id="chunk-C",
                chunk_a_document_id="doc-B",
                chunk_b_document_id="doc-C",
            ),
            make_inconsistency_pair(
                chunk_a_id="chunk-C",
                chunk_b_id="chunk-D",
                chunk_a_document_id="doc-C",
                chunk_b_document_id="doc-D",
            ),
        ]
    )


def _summary(stance_node_indices: list[int]) -> InconsistencySummaryLLMResponse:
    return InconsistencySummaryLLMResponse(
        cluster_title="Test contradiction cluster title",
        cluster_explanation="A consolidated explanation for the cluster.",
        stances=[
            NodeStance(node_idx=idx, stance_text=f"Stance from node {idx}")
            for idx in stance_node_indices
        ],
    )


class TestSummarizeCluster:
    @pytest.mark.asyncio
    async def test_builds_occurrences_for_each_stance(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        cluster = _make_cluster()
        # 4 distinct chunks → 4 nodes (idx 0..3). Pick stances on nodes 0 and 2.
        llm_response = _summary([0, 2])
        mock_llm = AsyncMock(return_value=llm_response)
        monkeypatch.setattr(module, "llm_invoke_structured", mock_llm)

        result = await module._summarize_cluster(cluster, model="self-hosted/gpt-oss-120b")

        assert len(result.inconsistencies) == 1
        summary = result.inconsistencies[0]
        assert summary.cluster_title == llm_response.cluster_title
        assert len(summary.occurrences) == 2
        assert mock_llm.await_count == 1

        # Stance node 0 should map to chunk-A's document, node 2 to chunk-C's document.
        doc_ids = {occ.document_id for occ in summary.occurrences}
        assert doc_ids == {"doc-A", "doc-C"}

    @pytest.mark.asyncio
    async def test_retries_on_invalid_node_indices(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        cluster = _make_cluster()
        # First response references node 99 (invalid), second is valid.
        responses: list[InconsistencySummaryLLMResponse] = [
            _summary([99]),
            _summary([1]),
        ]

        async def fake_llm(*_args: Any, **_kwargs: Any) -> InconsistencySummaryLLMResponse:
            return responses.pop(0)

        monkeypatch.setattr(module, "llm_invoke_structured", fake_llm)

        result = await module._summarize_cluster(cluster, model="self-hosted/gpt-oss-120b")

        assert len(result.inconsistencies[0].occurrences) == 1
        assert not responses  # both responses consumed → exactly one retry happened

    @pytest.mark.asyncio
    async def test_raises_after_max_validation_attempts(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        cluster = _make_cluster()

        # Always return invalid stance.
        async def fake_llm(*_args: Any, **_kwargs: Any) -> InconsistencySummaryLLMResponse:
            return _summary([999])

        monkeypatch.setattr(module, "llm_invoke_structured", fake_llm)

        with pytest.raises(ValueError, match="invalid node indices"):
            await module._summarize_cluster(cluster, model="self-hosted/gpt-oss-120b")


class TestValidateStanceNodeIndices:
    def test_accepts_all_valid_indices(self) -> None:
        summary = _summary([0, 1])
        result = module._validate_stance_node_indices(
            summary, node_idx_to_trace={0: {}, 1: {}, 2: {}}
        )
        assert result is None

    def test_rejects_unknown_indices(self) -> None:
        summary = _summary([0, 5])
        with pytest.raises(ValueError, match=r"\[5\]"):
            module._validate_stance_node_indices(
                summary, node_idx_to_trace={0: {}, 1: {}}
            )


class TestDeduplicateBundles:
    def test_removes_symmetric_pairs(self) -> None:
        from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
            ScreeningCandidateBundle,
        )

        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="A", reference_claims=["B", "C"],
            ),
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c2",
                claim_id="B", reference_claims=["A", "D"],  # A↔B already seen
            ),
        ]

        deduped = module._deduplicate_bundles(bundles)

        # First bundle keeps both refs; second drops A (mirror of A↔B already kept).
        assert deduped[0].reference_claims == ["B", "C"]
        assert deduped[1].reference_claims == ["D"]


class TestGroupBundlesByChunk:
    def test_same_chunk_groups_together(self) -> None:
        from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
            ScreeningCandidateBundle,
        )

        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id=f"A{i}", reference_claims=["R"],
            )
            for i in range(7)
        ]
        groups = module._group_bundles_by_chunk(bundles, max_per_group=5)

        # 7 same-chunk bundles → one full group of 5 + one partial of 2.
        assert sorted(len(g) for g in groups) == [2, 5]

    def test_packs_small_groups_across_chunks(self) -> None:
        from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
            ScreeningCandidateBundle,
        )

        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id=f"chunk-{i}",
                claim_id=f"claim-{i}", reference_claims=["R"],
            )
            for i in range(7)
        ]
        groups = module._group_bundles_by_chunk(bundles, max_per_group=5)

        # 7 different-chunk bundles → packs into 1×5 + 1×2.
        total = sum(len(g) for g in groups)
        assert total == 7
        assert max(len(g) for g in groups) <= 5
