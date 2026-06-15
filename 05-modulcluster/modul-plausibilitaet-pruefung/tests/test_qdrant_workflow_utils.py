"""Tests for workflow batching and child-workflow orchestration."""

import logging
from collections.abc import Awaitable, Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.dms.schemas import DMSFileResponse
from src.workflows.check_logic_wf.schemas.cluster_summarizer_schemas import InconsistencyClusters
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleResult,
    ScreeningCandidateBundle,
)
from src.workflows.check_logic_wf.schemas.screening_batch_schemas import ScreeningBatchInput, ScreeningBatchOutput
from src.workflows.check_logic_wf.single_document_workflow import PlausibilityCheckSingleDocumentWorkflow
from src.workflows.input_schemas import SingleDocumentWorkflowInputSchema
from src.workflows.qdrant_wf.extraction_batch_workflow import (
    ClaimExtractionBatchWorkflow,
    _extract_table_claims,
    _extract_text_claims_grouped,
    _group_text_chunks,
    _split_by_chars,
    _split_large_table,
)
from src.workflows.qdrant_wf.schemas.text_extraction import (
    GroupedClaimItem,
    GroupedExtractionResponse,
)
from src.workflows.qdrant_wf.schemas.workflow import (
    ExtractionBatchInput,
)

from .conftest import make_chunk_payload, make_claim_payload


def _table_chunk(html: str) -> Any:
    return make_chunk_payload(chunk_id="t1", chunk_content=html, chunk_type="table")


class TestGroupTextChunks:
    """Unit tests for _group_text_chunks with character budget."""

    def test_groups_by_count_when_content_is_small(self) -> None:
        chunks = [make_chunk_payload(chunk_id=f"c{i}", chunk_content="short") for i in range(5)]
        groups = _group_text_chunks(chunks, group_size=2, max_chars=100_000)
        assert [len(g) for g in groups] == [2, 2, 1]

    def test_spills_when_char_budget_exceeded(self) -> None:
        big = "x" * 6_000
        chunks = [make_chunk_payload(chunk_id=f"c{i}", chunk_content=big) for i in range(3)]
        # Budget of 10_000 chars fits only 1 chunk (~6120 with overhead), so each chunk gets its own group
        groups = _group_text_chunks(chunks, group_size=10, max_chars=10_000)
        assert [len(g) for g in groups] == [1, 1, 1]

    def test_empty_input_returns_empty(self) -> None:
        assert _group_text_chunks([], group_size=5, max_chars=10_000) == []

    def test_single_oversized_chunk_still_placed_in_group(self) -> None:
        huge = "x" * 200_000
        chunks = [make_chunk_payload(chunk_id="c0", chunk_content=huge)]
        # Even if a single chunk exceeds the budget, it must not be dropped
        groups = _group_text_chunks(chunks, group_size=10, max_chars=10_000)
        assert len(groups) == 1
        assert len(groups[0]) == 1


class TestSplitLargeTable:
    """Unit tests for _split_large_table HTML row splitting."""

    def _make_table_html(self, num_data_rows: int, row_content: str = "cell") -> str:
        header = "<tr><th>Col A</th><th>Col B</th></tr>"
        rows = "".join(f"<tr><td>{row_content} {i}</td><td>val {i}</td></tr>" for i in range(num_data_rows))
        return f"<table>{header}{rows}</table>"

    def test_small_table_returns_single_chunk(self) -> None:
        html = self._make_table_html(3)
        result = _split_large_table(_table_chunk(html), max_chars=100_000)
        assert len(result) == 1
        assert result[0].chunk_content == html

    def test_large_table_is_split_into_multiple_chunks(self) -> None:
        html = self._make_table_html(20, row_content="x" * 100)
        # Set a budget that forces splitting
        result = _split_large_table(_table_chunk(html), max_chars=1_000)
        assert len(result) > 1
        # Every sub-chunk must contain the header row
        for sub in result:
            assert "<th>Col A</th>" in sub.chunk_content
            assert "<th>Col B</th>" in sub.chunk_content
        # chunk_id is preserved on all splits
        assert all(sub.chunk_id == "t1" for sub in result)

    def test_single_oversized_row_not_dropped(self) -> None:
        html = self._make_table_html(1, row_content="x" * 5_000)
        result = _split_large_table(_table_chunk(html), max_chars=500)
        # Falls back to char splitting — oversized content still present
        all_content = "".join(sub.chunk_content for sub in result)
        assert "x" * 5_000 in all_content

    def test_malformed_html_falls_back_to_char_split(self) -> None:
        html = "<div>" + "x" * 500 + "</div>"
        result = _split_large_table(_table_chunk(html), max_chars=100)
        assert len(result) > 1
        all_content = "".join(sub.chunk_content for sub in result)
        assert all_content == html


class TestSplitByChars:
    """Unit tests for _split_by_chars fallback."""

    def test_prefers_tr_boundary(self) -> None:
        html = "<tr>row1</tr><tr>row2</tr><tr>row3</tr>"
        result = _split_by_chars(_table_chunk(html), max_chars=20)
        # Should split at </tr> boundaries
        assert result[0].chunk_content.endswith("</tr>")

    def test_hard_cut_when_no_tr(self) -> None:
        html = "x" * 500
        result = _split_by_chars(_table_chunk(html), max_chars=200)
        assert len(result) == 3
        all_content = "".join(sub.chunk_content for sub in result)
        assert all_content == html

    def test_preserves_all_content(self) -> None:
        html = "<tr>A</tr>" * 50
        result = _split_by_chars(_table_chunk(html), max_chars=50)
        all_content = "".join(sub.chunk_content for sub in result)
        assert all_content == html


class TestClaimExtractionBatchWorkflow:
    @pytest.mark.asyncio
    async def test_groups_text_chunks_and_flattens_all_claims(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import src.workflows.qdrant_wf.extraction_batch_workflow as module

        sliding_window_inputs: list[list[Any]] = []

        async def fake_sliding_window(
            items: list[Any],
            fn: Callable[[Any], Awaitable[Any]],
            concurrency: int,
        ) -> list[Any]:
            del fn, concurrency
            sliding_window_inputs.append(items)
            if len(sliding_window_inputs) == 1:
                # First call: grouped text chunks → returns claims per group
                return [[make_claim_payload(claim_id="text-1"), make_claim_payload(claim_id="text-2")]]
            # Second call: table chunks → returns claims per table
            return [[make_claim_payload(claim_id="table-1")]]

        monkeypatch.setattr(module, "sliding_window", fake_sliding_window)

        workflow_input = ExtractionBatchInput(
            project_id="proj-1",
            document_id="doc-1",
            is_erlaeuterungsbericht=False,
            text_chunks=[make_chunk_payload(chunk_id="text-1"), make_chunk_payload(chunk_id="text-2")],
            table_chunks=[make_chunk_payload(chunk_id="table-x", chunk_type="table")],
        )

        result = await ClaimExtractionBatchWorkflow().run(workflow_input)

        assert [claim.claim_id for claim in result.claims] == ["text-1", "text-2", "table-1"]
        # First sliding_window call: 2 chunks grouped into 1 group (batch size = 5)
        assert len(sliding_window_inputs[0]) == 1
        assert len(sliding_window_inputs[0][0]) == 2  # 2 chunks in the group
        # Second sliding_window call: 1 table chunk directly
        assert len(sliding_window_inputs[1]) == 1


class TestClaimExtractionHelpers:
    @pytest.mark.asyncio
    async def test_extract_text_claims_drops_invalid_llm_chunk_ids(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import src.workflows.qdrant_wf.extraction_batch_workflow as module

        monkeypatch.setattr(module.workflow, "logger", logging.getLogger("test"))
        monkeypatch.setattr(module.workflow, "uuid4", lambda: "generated-claim-id")
        monkeypatch.setattr(
            module,
            "llm_invoke_structured",
            AsyncMock(
                return_value=GroupedExtractionResponse(
                    claims=[
                        GroupedClaimItem(chunk_id=1, quotes=["quote"], claim="Valid claim"),
                        GroupedClaimItem(chunk_id=99, quotes=["bad"], claim="Invalid claim"),
                    ]
                )
            ),
        )

        claims = await _extract_text_claims_grouped(
            project_id="p",
            document_id="d",
            erlauterungsbericht=False,
            chunks=[make_chunk_payload(chunk_id="chunk-1", chunk_content="source text")],
            model="ionos/gpt-oss-120b",
        )

        assert len(claims) == 1
        assert claims[0].chunk_id == "chunk-1"
        assert claims[0].claim_text == "Valid claim"

    @pytest.mark.asyncio
    async def test_extract_table_claims_rejects_non_table_chunks(self) -> None:
        with pytest.raises(ValueError, match="not a table"):
            await _extract_table_claims(
                project_id="p",
                document_id="d",
                erlauterungsbericht=False,
                chunk=make_chunk_payload(chunk_type="text"),
                model="ionos/gpt-oss-120b",
            )
class TestPlausibilityCheckSingleDocumentWorkflow:
    @pytest.mark.asyncio
    async def test_batches_screening_children_and_uploads_checkpoint(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import src.workflows.check_logic_wf.single_document_workflow as module

        child_inputs: list[ScreeningBatchInput] = []
        upload_inputs: list[Any] = []

        monkeypatch.setattr(
            module.workflow,
            "info",
            lambda: SimpleNamespace(
                task_queue="test-queue",
                workflow_id="parent-plausibility-workflow",
                run_id="run-123",
                parent=None,
            ),
        )

        async def fake_execute_activity(
            activity: object, arg: Any = None, args: tuple[object, ...] | None = None, **kwargs: Any
        ) -> Any:
            del kwargs
            activity_name = getattr(activity, "__name__", "")
            if activity_name == "get_claim_ids":
                return ["claim-1", "claim-2"]
            if activity_name == "build_screening_bundles_for_document":
                return DocumentBundleResult(
                    bundles=[
                        ScreeningCandidateBundle(
                            project_id="proj-1",
                            document_id="doc-1",
                            chunk_id=f"chunk-{i}",
                            claim_id=f"claim-{i}",
                            reference_claims=[f"ref-{i}"],
                        )
                        for i in range(501)
                    ]
                )
            if activity_name == "build_clusters":
                return InconsistencyClusters(clusters=[])
            if activity_name == "upload_temporal_checkpoint":
                assert arg is not None
                upload_inputs.append(arg)
                return DMSFileResponse(
                    id="file-1",
                    type="file",
                    filename=arg.filename,
                    bucketPath="/bucket/file-1.json",
                    projectId="proj-1",
                )
            raise AssertionError(f"Unexpected activity {activity_name}, args={args}, arg={arg}")

        async def fake_execute_child_workflow(run_method: object, arg: ScreeningBatchInput, **kwargs: Any) -> Any:
            del run_method, kwargs
            child_inputs.append(arg)
            return ScreeningBatchOutput(context_check_outputs=[])

        async def fake_sliding_window(
            items: list[Any],
            fn: Callable[[Any], Awaitable[Any]],
            concurrency: int,
        ) -> list[Any]:
            del concurrency
            return [await fn(item) for item in items]

        monkeypatch.setattr(module.workflow, "execute_activity", fake_execute_activity)
        monkeypatch.setattr(module.workflow, "execute_child_workflow", fake_execute_child_workflow)
        monkeypatch.setattr(module, "sliding_window", fake_sliding_window)

        result = await PlausibilityCheckSingleDocumentWorkflow().run(
            SingleDocumentWorkflowInputSchema(project_id="proj-1", document_id="doc-1")
        )

        assert len(child_inputs) == 3
        # 501 unique-chunk bundles packed into groups of 5 → 100 full + 1 partial = 101 groups
        # 101 groups / batch_size=50 → 2 full batches + 1 partial = 3 child workflows
        assert len(child_inputs[0].bundles) == 50
        total_bundles = sum(len(g.bundles) for ci in child_inputs for g in ci.bundles)
        assert total_bundles == 501
        assert upload_inputs[0].filename == "plausibility_doc-1_run-123.json"
        assert result.id == "file-1"
