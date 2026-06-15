"""
Satz Orchestrator Workflow - Temporal implementation.

Per-Satz workflow:
  1. TBM DB Research and MatchSingleTBM run concurrently (Satzebene).
  2. After both complete, PageIndex SVM children run concurrently (or limited by max_concurrent_pageindex_svm).

Concurrency control (optional, on input):
  - max_concurrent_pageindex_svm: cap how many PageIndex SVM child workflows run at once (None = unbounded).
"""

import asyncio
import logging
from datetime import timedelta

from temporal.workflows.modul_suche_und_zuordnung.satz_orchestrator_workflow import (
    SATZ_ORCHESTRATOR_WORKFLOW_ID,
)
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Document,
    DocumentNode,
    PageIndexSVMWorkflowOutput,
    SatzOrchestratorWorkflowInput,
    SatzOrchestratorWorkflowOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.config import CONFIG
from src.satz_orchestrator_helpers import extract_satz_data
from src.workflows.match_single_tbm_workflow import (
    MatchedDocument,
    MatchSingleTBMWorkflow,
    MatchSingleTBMWorkflowInput,
)
from src.workflows.pageindex_svm_workflow import (
    PageIndexSVMWorkflow,
    PageIndexSVMWorkflowInput,
)
from src.workflows.tbm_db_research_workflow import (
    TBMDBResearchWorkflow,
    TBMDBResearchWorkflowInput,
)

logger = logging.getLogger(__name__)


# =============================================================================
# HELPERS
# =============================================================================
async def _run_pageindex_svm_for_doc(
    sem: asyncio.Semaphore,
    doc_idx: int,
    doc: "MatchedDocument",
    job_id: str,
    project_id: str,
    norm: str,
    tbm: str,
    research_report: str | None,
    document_nodes: list[Document],
) -> PageIndexSVMWorkflowOutput:
    """Execute a PageIndexSVMWorkflow child for a single matched document, respecting the concurrency semaphore."""
    svm_child_id = f"{job_id}-pageindex_svm-{doc.document_id}-{doc_idx}"
    matched_document = next((d for d in document_nodes if d.file_id == doc.document_id), None)
    child_input = PageIndexSVMWorkflowInput(
        project_id=project_id,
        document_id=doc.document_id or "unset",
        file_id=doc.document_id or "unset",
        filename=doc.title or "unset",
        norm=norm,
        tbm=tbm,
        research_report=research_report,
        document=matched_document,
    )
    async with sem:
        return await workflow.execute_child_workflow(
            PageIndexSVMWorkflow.run,
            child_input,
            id=svm_child_id,
            execution_timeout=timedelta(hours=4),
            task_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )


def _remove_node_duplicates(nodes: list[DocumentNode]) -> list[DocumentNode]:
    """Deduplicate document nodes by text content, preserving first occurrence order."""
    unique_nodes = []
    seen_texts = set()

    for node in nodes:
        if node.text not in seen_texts:
            unique_nodes.append(node)
            seen_texts.add(node.text)

    return unique_nodes


# =============================================================================
# WORKFLOW DEFINITION
# =============================================================================
@workflow.defn(name=SATZ_ORCHESTRATOR_WORKFLOW_ID)
class SatzOrchestratorWorkflow:
    """Orchestrates per-Satz document matching and PageIndex SVM ranking for a single norm clause."""

    @workflow.run
    async def run(
        self,
        input: SatzOrchestratorWorkflowInput,
    ) -> SatzOrchestratorWorkflowOutput:
        """Run TBM DB Research and MatchSingleTBM concurrently, then fan out PageIndex SVM over matched documents."""
        job_id = workflow.info().workflow_id

        workflow.logger.info(
            "[SATZ ORCHESTRATOR START] %s (satz='%s', tbm='%s')",
            job_id,
            input.satz_id,
            input.tbm[:80],
        )

        # ------------------------------------------------------------------
        # Cleaning step -- Deduplication of nodes
        # ------------------------------------------------------------------
        document_nodes = [
            Document(
                file_id=document.file_id,
                document_name=document.document_name,
                nodes=_remove_node_duplicates(document.nodes),
            )
            for document in input.document_nodes
        ]

        # ------------------------------------------------------------------
        # STEP 1 & 2 -- TBM DB Research and Match Satz run concurrently
        # ------------------------------------------------------------------
        workflow.logger.info("[STEP 1+2] Starting TBM DB Research and Match TBM concurrently")

        satz_data = extract_satz_data(input.data, input.satz_id)

        # Child IDs must be unique in the namespace.
        research_child_id = f"{job_id}-research-{workflow.uuid4()}"
        match_child_id = f"{job_id}-match-{input.satz_id}"

        research_output, match_output = await asyncio.gather(
            workflow.execute_child_workflow(
                TBMDBResearchWorkflow.run,
                TBMDBResearchWorkflowInput(
                    jurabk=satz_data["jurabk"],
                    paragraph_nr=satz_data["paragraph_nr"],
                    absatz_nr=satz_data["absatz_nr"],
                    satz_nr=satz_data["satz_nr"],
                    satz_text=satz_data["satz_text"],
                    tatbestandsmerkmale=satz_data["tatbestandsmerkmale"],
                    prueffragen=satz_data["prueffragen"],
                    rechtsbegriffe=satz_data["rechtsbegriffe"],
                ),
                id=research_child_id,
                execution_timeout=timedelta(hours=4),
                task_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2),
            ),
            workflow.execute_child_workflow(
                MatchSingleTBMWorkflow.run,
                MatchSingleTBMWorkflowInput(
                    data=input.data,
                    project_id=input.project_id,
                    satz_id=input.satz_id,
                    normdetail_id=input.normdetail_id,
                    research_report=None,
                ),
                id=match_child_id,
                execution_timeout=timedelta(hours=4),
                task_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2),
            ),
        )

        research_report = research_output.research_report

        # Deduplicate matched documents by document_id for SVM execution
        seen_doc_ids: set[str] = set()
        unique_docs: list[MatchedDocument] = []
        for doc in match_output.matched_documents:
            if doc.document_id and doc.document_id not in seen_doc_ids:
                seen_doc_ids.add(doc.document_id)
                unique_docs.append(doc)
            if len(unique_docs) >= CONFIG.MATCHING.DEFAULT_TOP_K:
                break

        workflow.logger.info(
            "[STEP 1+2 COMPLETE] TBM DB Research and Match finished -- %d matched documents (%d unique)",
            len(match_output.matched_documents),
            len(unique_docs),
        )

        # ------------------------------------------------------------------
        # STEP 3 -- PageIndex SVM (all children run concurrently)
        # ------------------------------------------------------------------
        svm_outputs: list[PageIndexSVMWorkflowOutput] = []
        if not unique_docs:
            workflow.logger.warning("[STEP 3 SKIPPED] No matched documents to process")
        else:
            max_concurrent = input.max_concurrent_pageindex_svm or len(unique_docs)
            sem = asyncio.Semaphore(max_concurrent)
            workflow.logger.info(
                "[STEP 3] Starting PageIndex SVM for %d documents (max %d concurrent)",
                len(unique_docs),
                max_concurrent,
            )
            svm_outputs = list(
                await asyncio.gather(
                    *[
                        _run_pageindex_svm_for_doc(
                            sem=sem,
                            doc_idx=idx,
                            doc=doc,
                            job_id=job_id,
                            project_id=input.project_id,
                            norm=input.norm,
                            tbm=input.tbm,
                            research_report=research_report,
                            document_nodes=document_nodes,
                        )
                        for idx, doc in enumerate(unique_docs)
                    ]
                )
            )
            workflow.logger.info(
                "[STEP 3 COMPLETE] PageIndex SVM finished for %d documents",
                len(svm_outputs),
            )

        # ------------------------------------------------------------------
        # ALL DONE
        # ------------------------------------------------------------------
        workflow.logger.info(
            "[SATZ ORCHESTRATOR SUCCESS] All steps completed for %s (%s)",
            job_id,
            input.satz_id,
        )

        # Flatten all originaltexte from all SVM outputs into a single list
        originaltexte = [
            entry for svm_output in svm_outputs if svm_output.result for entry in svm_output.result.originaltexte
        ]

        return SatzOrchestratorWorkflowOutput(
            satz_id=input.satz_id,
            gesetz_id=input.gesetz_id,
            norm_id=input.norm_id,
            originaltexte=originaltexte,
        )
