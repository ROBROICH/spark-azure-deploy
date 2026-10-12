"""Tests for the plausibility check orchestrator: retrieval, pair reduction, check fan-out."""

import logging
from collections.abc import Awaitable, Callable
from types import SimpleNamespace
from typing import Any

import pytest
from temporal.contracts import DMSFileResponse, PlausibilityOrchestratorInput

import src.workflows.check_logic_wf.workflow as module
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleResult,
    ScreeningCandidateBundle,
)
from src.workflows.input_schemas import CheckSingleDocumentWorkflowInputSchema


def _bundle(document_id: str, claim_id: str, references: list[str]) -> ScreeningCandidateBundle:
    return ScreeningCandidateBundle(
        project_id="proj-1",
        document_id=document_id,
        chunk_id=f"chunk-{claim_id}",
        claim_id=claim_id,
        reference_claims=references,
    )


def _dms_file_response(file_id: str, filename: str) -> DMSFileResponse:
    return DMSFileResponse(  # pyrefly: ignore[missing-argument]
        id=file_id,
        type="file",
        filename=filename,
        bucket_path=f"/bucket/{file_id}.json",
        project_id="proj-1",
    )


class _Run:
    """Recorded orchestrator run: which documents were retrieved and what each child received."""

    def __init__(self) -> None:
        self.activities: list[str] = []
        self.retrieved_documents: list[str] = []
        self.child_inputs: list[CheckSingleDocumentWorkflowInputSchema] = []
        self.aggregated_file_ids: list[str] = []

    def child_input(self, document_id: str) -> CheckSingleDocumentWorkflowInputSchema:
        return next(child for child in self.child_inputs if child.document_id == document_id)

    def references(self, document_id: str) -> dict[str, list[str]]:
        return {b.claim_id: b.reference_claims for b in self.child_input(document_id).bundle_result.bundles}


@pytest.fixture
def recorded_run(monkeypatch: pytest.MonkeyPatch) -> _Run:
    """Orchestrator with Temporal calls replaced; Qdrant returns the fixtures below."""
    recorded = _Run()

    claims_by_document: dict[str, list[str]] = {
        "doc-1": ["claim-a"],
        "doc-2": ["claim-b"],
        "doc-3": [],
    }
    bundles_by_document: dict[str, DocumentBundleResult] = {
        "doc-1": DocumentBundleResult(
            bundles=[_bundle("doc-1", "claim-a", ["claim-b"])],
            overflow_pairs=[("claim-a", "claim-b")],
        ),
        "doc-2": DocumentBundleResult(
            bundles=[_bundle("doc-2", "claim-b", ["claim-a"])],
            overflow_pairs=[("claim-b", "claim-a")],
        ),
    }

    async def fake_execute_activity(activity: object, arg: Any = None, *args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        activity_name = getattr(activity, "__name__", "")
        recorded.activities.append(activity_name)
        if activity_name == "get_claim_ids":
            recorded.retrieved_documents.append(arg.document_id)
            return claims_by_document[arg.document_id]
        if activity_name == "build_screening_bundles_for_document":
            return bundles_by_document[arg.document_id]
        if activity_name == "aggregate_and_upload_checkpoints":
            recorded.aggregated_file_ids = list(arg.file_ids)
            return _dms_file_response("aggregate-1", arg.filename)
        raise AssertionError(f"Unexpected activity {activity_name}")

    async def fake_execute_child_workflow(
        run_method: object, arg: CheckSingleDocumentWorkflowInputSchema, **kwargs: Any
    ) -> DMSFileResponse:
        del run_method, kwargs
        recorded.child_inputs.append(arg)
        return _dms_file_response(f"file-{arg.document_id}", f"plausibility_{arg.document_id}.json")

    async def fake_sliding_window(
        items: list[Any],
        fn: Callable[[Any], Awaitable[Any]],
        concurrency: int,
    ) -> list[Any]:
        del concurrency
        return [await fn(item) for item in items]

    monkeypatch.setattr(
        module.workflow,
        "info",
        lambda: SimpleNamespace(
            workflow_id="plausi-run-1",
            task_queue="test-queue",
            run_id="run-123",
        ),
    )
    monkeypatch.setattr(module.workflow, "logger", logging.getLogger("test"))
    monkeypatch.setattr(module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(module.workflow, "execute_child_workflow", fake_execute_child_workflow)
    monkeypatch.setattr(module, "sliding_window", fake_sliding_window)
    return recorded


async def _run_orchestrator(document_ids: list[str]) -> DMSFileResponse:
    workflow_input = PlausibilityOrchestratorInput(  # pyrefly: ignore[missing-argument]
        project_id="proj-1",
        document_ids=document_ids,
    )
    return await module.PlausibilityCheckOrchestratorWorkflow().run(workflow_input)


class TestPairReductionAcrossDocuments:
    @pytest.mark.asyncio
    async def test_symmetric_cross_document_pair_reaches_only_one_child(self, recorded_run: _Run) -> None:
        """The defect: both documents retrieved the same unordered pair, so one direction must go."""
        await _run_orchestrator(["doc-1", "doc-2"])

        assert recorded_run.references("doc-1") == {"claim-a": ["claim-b"]}
        assert recorded_run.references("doc-2") == {"claim-b": []}

    @pytest.mark.asyncio
    async def test_symmetric_overflow_pair_reaches_only_one_child(self, recorded_run: _Run) -> None:
        await _run_orchestrator(["doc-1", "doc-2"])

        assert recorded_run.child_input("doc-1").bundle_result.overflow_pairs == [("claim-a", "claim-b")]
        assert recorded_run.child_input("doc-2").bundle_result.overflow_pairs == []


class TestOrchestration:
    @pytest.mark.asyncio
    async def test_document_without_claims_skips_bundle_retrieval(self, recorded_run: _Run) -> None:
        await _run_orchestrator(["doc-3"])

        child = recorded_run.child_input("doc-3")
        assert child.has_claims is False
        assert child.bundle_result.bundles == []
        assert "build_screening_bundles_for_document" not in recorded_run.activities

    @pytest.mark.asyncio
    async def test_every_document_gets_one_child_and_one_checkpoint(self, recorded_run: _Run) -> None:
        result = await _run_orchestrator(["doc-1", "doc-2", "doc-3"])

        assert [child.document_id for child in recorded_run.child_inputs] == ["doc-1", "doc-2", "doc-3"]
        assert recorded_run.aggregated_file_ids == ["file-doc-1", "file-doc-2", "file-doc-3"]
        assert result.id == "aggregate-1"

    @pytest.mark.asyncio
    async def test_repeated_document_id_is_retrieved_and_checked_once(self, recorded_run: _Run) -> None:
        await _run_orchestrator(["doc-1", "doc-1"])

        assert recorded_run.retrieved_documents == ["doc-1"]
        assert [child.document_id for child in recorded_run.child_inputs] == ["doc-1"]
