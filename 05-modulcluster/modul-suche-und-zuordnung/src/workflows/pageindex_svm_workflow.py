"""
PageIndex SVM Workflow - Temporal implementation.

Runs a two-stage LLM pipeline to identify and filter relevant document
sections for a given Tatbestandsmerkmal (TBM):
  Stage 1: Node selection via multi-query consensus
  Stage 2: Sentence-level filtering within selected nodes
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

from prompt_injection.prompt_defense import wrap_system_prompt
from pydantic import BaseModel, ValidationError
from temporal.activities.llm import _DEFAULT_RETRY, llm_invoke
from temporal.activities.models import ChatModel
from temporal.workflows.modul_suche_und_zuordnung.types import Document, PageIndexSVMWorkflowOutput
from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError

from src.config import CONFIG
from src.config.env import ENV
from src.pageindex_svm.consensus import consensus_vote
from src.pageindex_svm.extraction import build_result
from src.pageindex_svm.json_utils import parse_llm_json
from src.pageindex_svm.preparation import prepare_stage1, prepare_stage2
from src.pageindex_svm.prompts import STAGE1_SYSTEM_PROMPT, STAGE2_SYSTEM_PROMPT, Stage1Response, Stage2SentenceResponse

# Stage 1 retry policy: Temporal handles retries, Python loop is bypassed (max_parse_attempts=1).
_STAGE1_RETRY = RetryPolicy(
    maximum_attempts=CONFIG.PAGEINDEX_SVM.MAX_PARSE_ATTEMPTS_STAGE1,
    initial_interval=timedelta(seconds=10),
    backoff_coefficient=2,
)


# =============================================================================
# Helpers
# =============================================================================
async def _llm_invoke_with_parse[T: BaseModel](
    prompt: str,
    system_prompt: str,
    output_class: type[T],
    *,
    model: ChatModel,
    temperature: float,
    max_tokens: int | None = None,
    reasoning_effort: str | None = None,
    max_parse_attempts: int = 30,
    retry_policy: RetryPolicy = _DEFAULT_RETRY,
) -> T:
    """Call ``llm_invoke`` and parse the response into *output_class* with retries.

    ``max_parse_attempts`` controls how many times the Python loop retries on bad JSON.
    ``retry_policy`` is forwarded to Temporal — pass a single-attempt RetryPolicy to let
    the Python loop be the only retry layer (avoids the default 30 Temporal retries).
    """
    raw = ""
    for attempt in range(1, max_parse_attempts + 1):
        try:
            raw = await llm_invoke(
                prompt,
                system_prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                reasoning_effort=reasoning_effort,
                no_cache=True,
                retry_policy=retry_policy,
            )
            return parse_llm_json(raw, output_class)
        except (ValueError, ValidationError, ActivityError):
            if attempt == max_parse_attempts:
                raise ApplicationError(
                    f"JSON parse failed for {output_class.__name__} after {max_parse_attempts} attempts: {raw[:500]}",
                    non_retryable=True,
                ) from None
            workflow.logger.warning(
                "JSON parse failed for %s (attempt %d/%d), retrying",
                output_class.__name__,
                attempt,
                max_parse_attempts,
            )

    raise AssertionError("unreachable")


# =============================================================================
# WORKFLOW IDENTIFIER
# =============================================================================
pageindex_svm_workflow_id = "pageindex_svm"


# =============================================================================
# INPUT / OUTPUT TYPES
# =============================================================================
class PageIndexSVMWorkflowInput(BaseModel):
    """Input parameters for a single PageIndex SVM workflow run."""

    project_id: str
    document_id: str
    file_id: str
    filename: str
    norm: str
    tbm: str
    research_report: str | None
    document: Document | None


# =============================================================================
# WORKFLOW DEFINITION
# =============================================================================
@workflow.defn(name=pageindex_svm_workflow_id)
class PageIndexSVMWorkflow:
    """Identifies relevant document nodes for a norm via LLM consensus and SVM scoring."""

    @workflow.run
    async def run(
        self,
        input: PageIndexSVMWorkflowInput,
    ) -> PageIndexSVMWorkflowOutput:
        """Executes the two-stage node selection pipeline and returns scored page-index results."""
        if not input.document:
            raise RuntimeError(f"No document provided for file_id={input.file_id}")

        research = input.research_report or ""

        # Stage 1: Select relevant nodes via LLM consensus
        stage1_prompt, node_map, index_to_node_id = prepare_stage1(
            input.document, input.norm, input.tbm, research, CONFIG.PAGEINDEX_SVM.STAGE1_MAX_INPUT_TOKENS
        )

        if stage1_prompt is None:
            workflow.logger.warning(
                "[PAGEINDEX] Stage 1 prompt too large even after summary truncation — skipping to Stage 2 with all %d nodes",
                len(node_map),
            )
            selected_nodes = list(node_map.keys())
        else:
            try:
                stage1_results = await asyncio.gather(
                    *[
                        _llm_invoke_with_parse(
                            stage1_prompt,
                            wrap_system_prompt(STAGE1_SYSTEM_PROMPT, lang="de"),
                            Stage1Response,
                            model=ENV.LLM.PAGEINDEX_SVM_MODEL_STAGE1,
                            temperature=CONFIG.PAGEINDEX_SVM.CONSENSUS_TEMPERATURE,
                            max_tokens=CONFIG.PAGEINDEX_SVM.MODEL_STAGE1_MAX_TOKENS,
                            reasoning_effort=CONFIG.PAGEINDEX_SVM.MODEL_STAGE1_REASONING_EFFORT,
                            max_parse_attempts=1,
                            retry_policy=_STAGE1_RETRY,
                        )
                        for _ in range(CONFIG.PAGEINDEX_SVM.CONSENSUS_RUNS)
                    ]
                )
                # consensus_vote returns string indices ("0", "1", ...); map back to real node IDs
                selected_indices = consensus_vote(list(stage1_results))
                selected_nodes = []
                for idx in selected_indices:
                    try:
                        real_id = index_to_node_id.get(int(idx))
                        if real_id:
                            selected_nodes.append(real_id)
                    except ValueError:
                        pass
            except (ApplicationError, ActivityError):
                workflow.logger.warning(
                    "[PAGEINDEX] Stage 1 failed after retries — falling back to all %d nodes",
                    len(node_map),
                )
                selected_nodes = list(node_map.keys())

        # Stage 2: Filter sentences in selected nodes
        stage2_prompts, batch_sentence_maps = prepare_stage2(selected_nodes, node_map, input.norm, input.tbm, research)
        stage2_results = await asyncio.gather(
            *[
                _llm_invoke_with_parse(
                    prompt,
                    wrap_system_prompt(STAGE2_SYSTEM_PROMPT, lang="de"),
                    Stage2SentenceResponse,
                    model=ENV.LLM.PAGEINDEX_SVM_MODEL_STAGE2,
                    temperature=CONFIG.PAGEINDEX_SVM.STAGE2_TEMPERATURE,
                    max_tokens=CONFIG.PAGEINDEX_SVM.MODEL_STAGE2_MAX_TOKENS,
                    reasoning_effort=CONFIG.PAGEINDEX_SVM.MODEL_STAGE2_REASONING_EFFORT,
                )
                for prompt in stage2_prompts
            ]
        )

        # Build final result
        result = build_result(
            selected_nodes,
            list(stage2_results),
            batch_sentence_maps,
            node_map,
            document_id=input.file_id,
        )

        result.originaltexte = [e for e in result.originaltexte if e.text != "(...)"]

        return PageIndexSVMWorkflowOutput(result=result)
