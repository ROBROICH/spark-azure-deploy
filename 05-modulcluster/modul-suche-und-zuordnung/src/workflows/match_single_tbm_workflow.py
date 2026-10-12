"""Temporal workflow for matching a single TBM (Textbaustein-Menge) to relevant documents."""

import asyncio
import logging
from typing import Any

from pydantic import BaseModel
from temporal.activities.embedding import embedding_invoke
from temporal.contracts import SucheZuordnungNormData as NormData
from temporalio import workflow

from src.Activities.processing_activities import (
    fetch_rule_based,
    retrieve_chunks,
    retrieve_questions,
    retrieve_summaries,
)
from src.config.env import ENV
from src.tbm_matching.query_building import build_queries
from src.tbm_matching.ranking import reciprocal_rank_fusion
from src.tbm_matching.tbm_enrichment import (
    extract_tbms_for_satz,
    fuse_retrieval_results,
)

logger = logging.getLogger(__name__)

# =============================================================================
# WORKFLOW IDENTIFIER
# =============================================================================
# This identifier should rarely change - Temporal associates execution with this ID
match_single_tbm_workflow_id = "match_single_tbm"


# =============================================================================
# TYPES
# =============================================================================
class MatchedDocument(BaseModel):
    """A candidate document returned as a match result, identified by its ID and title."""

    document_id: str | None
    title: str | None


class MatchSingleTBMWorkflowInput(BaseModel):
    """Input for matching a single satz against the project document index."""

    data: NormData
    project_id: str
    satz_id: str
    normdetail_id: str
    research_report: str | None


class MatchSingleTBMWorkflowOutput(BaseModel):
    """Ranked documents matched to a satz, keyed by its absatz/satz number combination."""

    satz_key: str
    matched_documents: list[MatchedDocument]


# =============================================================================
# HELPERS
# =============================================================================
def _fuse_tbm_results(
    enriched_tbms: list[dict[str, Any]],
) -> list[MatchedDocument]:
    """Fuse the per-TBM document rankings of one satz into a single ranking.

    Each TBM contributes one ranked list, so a document that is relevant for several
    TBMs of the satz outranks one that is relevant for a single TBM. The satz-level
    document count cap is applied upstream in ``satz_orchestrator_workflow.py``.
    """
    ranked = reciprocal_rank_fusion([tbm.get("svms") or [] for tbm in enriched_tbms], top_k=None)
    return [
        MatchedDocument(
            document_id=doc["document_id"],
            title=doc["title"],
        )
        for doc in ranked
    ]


# =============================================================================
# WORKFLOW DEFINITION
# =============================================================================
@workflow.defn(name=match_single_tbm_workflow_id)
class MatchSingleTBMWorkflow:
    """Retrieves and ranks documents for a single satz using multi-source parallel retrieval."""

    @workflow.run
    async def run(self, input: MatchSingleTBMWorkflowInput) -> MatchSingleTBMWorkflowOutput:
        """Executes embedding, parallel retrieval, fusion, and ranking for one satz."""
        job_id = workflow.info().workflow_id
        workflow.logger.info(
            "[WORKFLOW START] MatchSatz workflow %s (project_id=%s, satz_id=%s, normdetail_id=%s)",
            job_id,
            input.project_id,
            input.satz_id,
            input.normdetail_id,
        )

        # Step 1: Extract TBMs and build queries (pure computation, safe in workflow)
        workflow.logger.info("[STEP 1] Extracting TBMs and building queries")
        tbm_list = extract_tbms_for_satz(input.data, input.satz_id)
        satz_key = f"{tbm_list[0]['_absatz_nr']}/{tbm_list[0]['_satz_nr']}"
        queries = build_queries(tbm_list)
        workflow.logger.info("[STEP 1 COMPLETE] Built %d queries from %d TBMs", len(queries), len(tbm_list))

        # Step 2: Generate embeddings once via shared client
        workflow.logger.info("[STEP 2] Generating embeddings via shared embedding client")
        embeddings = await embedding_invoke(texts=queries, model=ENV.LLM.EMBEDDING_MODEL)
        workflow.logger.info("[STEP 2 COMPLETE] Generated %d embeddings", len(embeddings))

        # Step 3: Run all 4 retrieval sources in parallel
        workflow.logger.info("[STEP 3] Running 4 retrieval sources in parallel")
        chunks, summaries, questions, rules = await asyncio.gather(
            retrieve_chunks(queries, embeddings, input.project_id, threshold=0.4),
            retrieve_summaries(queries, embeddings, input.project_id, threshold=0.4),
            retrieve_questions(queries, embeddings, input.project_id, threshold=0.4),
            fetch_rule_based(input.project_id, tbm_list),
        )
        workflow.logger.info("[STEP 3 COMPLETE] All retrieval sources returned")

        # Step 4: Fuse results (pure computation, safe in workflow)
        workflow.logger.info("[STEP 4] Fusing retrieval results")
        enriched = fuse_retrieval_results(tbm_list, chunks, summaries, questions, rules)
        matched_docs = _fuse_tbm_results(enriched)
        workflow.logger.info(
            "[STEP 4 COMPLETE] Fused %d TBM rankings into %d documents",
            len(enriched),
            len(matched_docs),
        )

        workflow.logger.info("[WORKFLOW SUCCESS] Job %s completed", job_id)

        return MatchSingleTBMWorkflowOutput(
            satz_key=satz_key,
            matched_documents=matched_docs,
        )
