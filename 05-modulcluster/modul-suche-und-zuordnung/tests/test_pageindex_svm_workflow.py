"""
Tests for src/workflows/pageindex_svm_workflow.py — the two Stage 1 fallback paths.

Both paths skip the consensus round, so their entries must carry no consensus
ratio while still carrying a confidence value.
"""

import logging

import pytest
from temporal.contracts import SucheZuordnungDocument as Document
from temporal.contracts import SucheZuordnungDocumentNode as DocumentNode
from temporalio import workflow
from temporalio.exceptions import ApplicationError

from src.pageindex_svm.prompts import ChunkSentenceResult, Stage2SentenceResponse
from src.workflows import pageindex_svm_workflow as module
from src.workflows.pageindex_svm_workflow import PageIndexSVMWorkflow, PageIndexSVMWorkflowInput

RELEVANCE = 0.6


@pytest.fixture(autouse=True)
def _workflow_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    """workflow.logger requires a workflow event loop, which these tests do not run."""
    monkeypatch.setattr(workflow, "logger", logging.getLogger("test-pageindex"))


NODE = DocumentNode(node_id="n1", title="A", text="a", summary="", chunk_ids=[], page_numbers=[])


def _input() -> PageIndexSVMWorkflowInput:
    return PageIndexSVMWorkflowInput(
        project_id="p1",
        document=Document(file_id="f1", document_name="doc", nodes=[NODE]),
        norm="Norm",
        tbm="TBM",
        file_id="f1",
        research_report=None,
    )


def _patch_stage2(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stage 2 returns one relevant sentence with a known relevance value."""
    monkeypatch.setattr(module, "prepare_stage2", lambda *_args, **_kwargs: (["prompt"], [{"n1": ["a"]}]))

    async def _stage2(*_args: object, **_kwargs: object) -> Stage2SentenceResponse:
        return Stage2SentenceResponse(
            results=[
                ChunkSentenceResult(node_id="n1", relevant_indices=[0], begruendung="r", relevance=RELEVANCE)
            ]
        )

    monkeypatch.setattr(module, "_llm_invoke_with_parse", _stage2)


class TestStage1FallbackPaths:
    """Both fallback paths must report an absent consensus rate and a set confidence."""

    async def test_prompt_too_large(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An oversized Stage 1 prompt skips consensus and keeps every node."""
        node_map = {"n1": NODE}
        monkeypatch.setattr(module, "prepare_stage1", lambda *_args, **_kwargs: (None, node_map, {}))
        _patch_stage2(monkeypatch)

        output = await PageIndexSVMWorkflow().run(_input())

        assert output.result is not None
        entry = output.result.originaltexte[0]
        assert entry.consensus_ratio is None
        assert entry.relevance == pytest.approx(RELEVANCE)
        assert entry.confidence == pytest.approx(RELEVANCE)

    async def test_stage1_fails_after_retries(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A failing Stage 1 skips consensus and keeps every node."""
        node_map = {"n1": NODE}
        monkeypatch.setattr(module, "prepare_stage1", lambda *_args, **_kwargs: ("prompt", node_map, {}))
        monkeypatch.setattr(module, "prepare_stage2", lambda *_args, **_kwargs: (["prompt"], [{"n1": ["a"]}]))

        async def _invoke(_prompt: str, _system: str, output_class: type, **_kwargs: object) -> object:
            if output_class is Stage2SentenceResponse:
                return Stage2SentenceResponse(
                    results=[
                        ChunkSentenceResult(
                            node_id="n1", relevant_indices=[0], begruendung="r", relevance=RELEVANCE
                        )
                    ]
                )
            raise ApplicationError("stage 1 exhausted its retries")

        monkeypatch.setattr(module, "_llm_invoke_with_parse", _invoke)

        output = await PageIndexSVMWorkflow().run(_input())

        assert output.result is not None
        entry = output.result.originaltexte[0]
        assert entry.consensus_ratio is None
        assert entry.confidence == pytest.approx(RELEVANCE)
