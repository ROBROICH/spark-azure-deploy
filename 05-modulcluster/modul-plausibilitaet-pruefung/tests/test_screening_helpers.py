"""Unit tests for the workflow-level screening/context-check helpers."""

import logging
from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import AsyncMock

import pytest

import src.workflows.check_logic_wf.screening_context_batch_workflow as module
from src.activities.dms_activities import ProjectMetadataResult
from src.dms.schemas import BaseMetadata, ProjectBaseMetadataStatus
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    ConflictCheckerLLMOutput,
    ContextCheckerInput,
)
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    GroupedRiskScreenerResponse,
    GroupedScreeningBundle,
    GroupedScreeningResultItem,
    ResolvedClaimData,
    ResolvedGroupedScreeningBundle,
    ScreeningCandidateBundle,
    ScreeningHit,
)
from src.workflows.check_logic_wf.schemas.screening_batch_schemas import ScreeningBatchInput

from .conftest import make_chunk_with_context


@pytest.fixture(autouse=True)
def _patch_workflow_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(module.workflow, "logger", logging.getLogger("test"))


def _make_resolved_bundle(
    bundles: list[ScreeningCandidateBundle],
    extra_claim_text: dict[str, str] | None = None,
) -> ResolvedGroupedScreeningBundle:
    payloads: dict[str, ResolvedClaimData] = {}
    for b in bundles:
        payloads[b.claim_id] = ResolvedClaimData(
            claim_id=b.claim_id, chunk_id=b.chunk_id, claim_text=f"text-{b.claim_id}"
        )
        for ref in b.reference_claims:
            payloads.setdefault(
                ref,
                ResolvedClaimData(claim_id=ref, chunk_id=f"chunk-{ref}", claim_text=f"text-{ref}"),
            )
    if extra_claim_text:
        for cid, text in extra_claim_text.items():
            payloads[cid] = ResolvedClaimData(claim_id=cid, chunk_id=f"chunk-{cid}", claim_text=text)
    return ResolvedGroupedScreeningBundle(
        project_id="p", document_id="d", bundles=bundles, claim_payloads=payloads,
    )


class TestScreenGroupedBundle:
    @pytest.mark.asyncio
    async def test_translates_indices_back_to_uuids_and_filters_by_threshold(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="A", reference_claims=["R1", "R2"],
            ),
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="B", reference_claims=["R1"],
            ),
        ]
        resolved = _make_resolved_bundle(bundles)

        # LLM emits 3 results: 2 above threshold, 1 below.
        threshold = module.config.RISK_SCREENING.RATING_THRESHOLD
        llm_response = GroupedRiskScreenerResponse(
            results=[
                GroupedScreeningResultItem(
                    check_id=1, reference_id=1, rating=threshold + 10,
                    note="risky", reasoning="long enough reasoning here",
                ),
                GroupedScreeningResultItem(
                    check_id=1, reference_id=2, rating=max(threshold - 10, 0),
                    note="below", reasoning="long enough reasoning here",
                ),
                GroupedScreeningResultItem(
                    check_id=2, reference_id=1, rating=threshold + 5,
                    note="risky", reasoning="long enough reasoning here",
                ),
            ]
        )
        monkeypatch.setattr(module, "llm_invoke_structured", AsyncMock(return_value=llm_response))

        hits = await module._screen_grouped_bundle(resolved, model="self-hosted/gpt-oss-120b")

        # Only ratings ≥ threshold kept; indices map back to original UUIDs.
        assert {(h.claim_id, h.reference_id) for h in hits} == {("A", "R1"), ("B", "R1")}
        assert all(h.rating >= threshold for h in hits)

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_check_claims(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Reference appears in bundle but is missing from payloads → no check claim usable.
        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="A", reference_claims=["MISSING"],
            ),
        ]
        # Drop the only ref from payloads, so check claim has no valid refs.
        resolved = ResolvedGroupedScreeningBundle(
            project_id="p", document_id="d", bundles=bundles,
            claim_payloads={
                "A": ResolvedClaimData(claim_id="A", chunk_id="c1", claim_text="text-A"),
            },
        )
        llm_mock = AsyncMock()
        monkeypatch.setattr(module, "llm_invoke_structured", llm_mock)

        hits = await module._screen_grouped_bundle(resolved, model="self-hosted/gpt-oss-120b")

        assert hits == []
        llm_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_bundle_whose_claim_payload_is_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bundles = [
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="MISSING_CHECK", reference_claims=["R1"],
            ),
            ScreeningCandidateBundle(
                project_id="p", document_id="d", chunk_id="c1",
                claim_id="A", reference_claims=["R1"],
            ),
        ]
        # Payloads include only A and R1.
        resolved = ResolvedGroupedScreeningBundle(
            project_id="p", document_id="d", bundles=bundles,
            claim_payloads={
                "A": ResolvedClaimData(claim_id="A", chunk_id="c1", claim_text="text-A"),
                "R1": ResolvedClaimData(claim_id="R1", chunk_id="cR1", claim_text="text-R1"),
            },
        )
        threshold = module.config.RISK_SCREENING.RATING_THRESHOLD
        llm_response = GroupedRiskScreenerResponse(
            results=[
                GroupedScreeningResultItem(
                    check_id=1, reference_id=1, rating=threshold + 1,
                    note="risky", reasoning="long enough reasoning here",
                ),
            ]
        )
        monkeypatch.setattr(module, "llm_invoke_structured", AsyncMock(return_value=llm_response))

        hits = await module._screen_grouped_bundle(resolved, model="self-hosted/gpt-oss-120b")

        # Only A→R1 survives (MISSING_CHECK was filtered before LLM call).
        assert len(hits) == 1
        assert hits[0].claim_id == "A"
        assert hits[0].reference_id == "R1"


class TestCheckConflict:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "rating_offset, expected_inconsistency",
        [(5, True), (-10, False)],
        ids=["above_threshold", "below_threshold"],
    )
    async def test_inconsistency_flag_follows_threshold(
        self,
        monkeypatch: pytest.MonkeyPatch,
        rating_offset: int,
        expected_inconsistency: bool,
    ) -> None:
        threshold = module.config.CONTEXT_CHECKING.RATING_THRESHOLD
        rating = max(threshold + rating_offset, 0)
        llm_output = ConflictCheckerLLMOutput(
            rating=rating,
            title="Result",
            explanation="A detailed explanation that meets the minimum length.",
            chunk_a_excerpt="Excerpt A here",
            chunk_b_excerpt="Excerpt B here",
            audit_explanation="Self-audit details — long enough to pass validation.",
        )
        monkeypatch.setattr(module, "llm_invoke_structured", AsyncMock(return_value=llm_output))

        request = ContextCheckerInput(
            project_id="p", document_id="d",
            claim_id="claim-A", reference_claim_id="claim-B",
            screening_note="note",
        )
        meta = ProjectMetadataResult(
            metadata=BaseMetadata.fallback_unknown("p"),
            status=ProjectBaseMetadataStatus.FALLBACK_MISSING,
        )

        out = await module._check_conflict(
            request=request,
            chunk_a_context=make_chunk_with_context(document_id="doc-A"),
            chunk_b_context=make_chunk_with_context(document_id="doc-B"),
            project_meta_result=meta,
            chunk_a_id="chunk-A",
            chunk_b_id="chunk-B",
            model="self-hosted/gpt-oss-120b",
        )

        assert out.is_inconsistency is expected_inconsistency
        assert out.verdict.rating == rating
        assert (out.claim_a_id, out.claim_b_id) == ("claim-A", "claim-B")
        assert (out.chunk_a_id, out.chunk_b_id) == ("chunk-A", "chunk-B")


class TestScreeningContextBatchWorkflow:
    @pytest.mark.asyncio
    async def test_run_returns_empty_when_screening_has_no_hits(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        activity_names: list[str] = []

        async def fake_execute_activity(
            activity: object,
            arg: object | None = None,
            *args: object,
            **kwargs: object,
        ) -> object:
            del arg, args, kwargs
            activity_names.append(getattr(activity, "__name__", ""))
            empty_payloads: dict[str, ResolvedClaimData] = {}
            return empty_payloads

        async def fake_sliding_window(
            items: list[GroupedScreeningBundle],
            fn: Callable[[Any], Awaitable[Any]],
            concurrency: int,
        ) -> list[list[ScreeningHit]]:
            del items, fn, concurrency
            return [[]]

        monkeypatch.setattr(module.workflow, "execute_activity", fake_execute_activity)
        monkeypatch.setattr(module, "sliding_window", fake_sliding_window)

        result = await module.PlausibilityScreeningContextBatchWorkflow().run(
            ScreeningBatchInput(
                project_id="p",
                document_id="d",
                bundles=[GroupedScreeningBundle(project_id="p", document_id="d", bundles=[])],
            )
        )

        assert result.context_check_outputs == []
        assert activity_names == ["fetch_screening_payloads_batch"]

    @pytest.mark.asyncio
    async def test_run_skips_hits_with_missing_chunk_contexts(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hit = ScreeningHit(
            claim_id="claim-A",
            reference_id="claim-B",
            claim_chunk_id="chunk-A",
            reference_chunk_id="chunk-B",
            rating=95,
            note="Needs context check.",
            reasoning="The claims look conflicting enough to require context.",
        )
        activity_names: list[str] = []
        sliding_window_calls = 0

        async def fake_execute_activity(
            activity: object,
            arg: object | None = None,
            *args: object,
            **kwargs: object,
        ) -> object:
            del arg, args, kwargs
            activity_name = getattr(activity, "__name__", "")
            activity_names.append(activity_name)
            if activity_name == "fetch_screening_payloads_batch":
                screening_payloads: dict[str, ResolvedClaimData] = {}
                return screening_payloads
            if activity_name == "build_chunk_contexts_batch":
                chunk_contexts: dict[str, object] = {}
                return chunk_contexts
            if activity_name == "fetch_project_metadata":
                return ProjectMetadataResult(
                    metadata=BaseMetadata.fallback_unknown("p"),
                    status=ProjectBaseMetadataStatus.FALLBACK_MISSING,
                )
            raise AssertionError(f"Unexpected activity: {activity_name}")

        async def fake_sliding_window(
            items: list[GroupedScreeningBundle] | list[ScreeningHit],
            fn: Callable[[Any], Awaitable[Any]],
            concurrency: int,
        ) -> list[list[ScreeningHit]]:
            nonlocal sliding_window_calls
            del items, fn, concurrency
            sliding_window_calls += 1
            if sliding_window_calls == 1:
                return [[hit]]
            raise AssertionError("Context checks should not run without chunk contexts")

        monkeypatch.setattr(module.workflow, "execute_activity", fake_execute_activity)
        monkeypatch.setattr(module, "sliding_window", fake_sliding_window)

        result = await module.PlausibilityScreeningContextBatchWorkflow().run(
            ScreeningBatchInput(
                project_id="p",
                document_id="d",
                bundles=[
                    GroupedScreeningBundle(
                        project_id="p",
                        document_id="d",
                        bundles=[
                            ScreeningCandidateBundle(
                                project_id="p",
                                document_id="d",
                                chunk_id="chunk-A",
                                claim_id="claim-A",
                                reference_claims=["claim-B"],
                            )
                        ],
                    )
                ],
            )
        )

        assert result.context_check_outputs == []
        assert activity_names == [
            "fetch_screening_payloads_batch",
            "build_chunk_contexts_batch",
            "fetch_project_metadata",
        ]
        assert sliding_window_calls == 1
