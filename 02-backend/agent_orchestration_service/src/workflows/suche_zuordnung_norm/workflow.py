"""
Suche & Zuordnung Norm Workflow.

Top-level orchestrator that iterates over every Satz in the input norm data
and spawns one SatzOrchestratorWorkflow child per Satz that has
tatbestandsmerkmale. All Satz children run concurrently (bounded by
MAX_CONCURRENT_SATZ_CHILDREN).

Runs on the agent_orchestration_service task queue; child workflows run
on the modul-suche-und-zuordnung task queue.
"""

import asyncio
from datetime import timedelta
from typing import Any

from temporal.utils import sliding_window
from temporal.workflows.modul_suche_und_zuordnung.satz_orchestrator_workflow import (
    SATZ_ORCHESTRATOR_WORKFLOW_ID,
)
from temporal.workflows.modul_suche_und_zuordnung.types import (
    Document,
    SatzOrchestratorWorkflowInput,
    SatzOrchestratorWorkflowOutput,
)
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.workflows.insert_suche_zuordnung_results.types import (
    InsertSucheZuordnungResultsInput,
)
from src.workflows.insert_suche_zuordnung_results.workflow import execute_insert_suche_zuordnung_results
from src.workflows.suche_zuordnung_norm.activity import (
    FetchDocumentNodesInput,
    FetchNormDataInput,
    FetchNormExaminationIdsInput,
    NormExaminationIds,
    fetch_document_nodes,
    fetch_norm_data,
    fetch_norm_examination_ids,
)
from src.workflows.suche_zuordnung_norm.helpers import collect_saetze, derive_norm
from src.workflows.suche_zuordnung_norm.types import (
    SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID,
    SucheZuordnungNormWorkflowInput,
    SucheZuordnungNormWorkflowOutput,
)

SATZ_TASK_QUEUE = "modul-suche-und-zuordnung"
MAX_CONCURRENT_SATZ_CHILDREN = 8
MAX_CONCURRENT_PAGEINDEX_SVM = 2


async def _run_satz_child(
    satz_info: dict[str, Any],
    norm: str,
    input: SucheZuordnungNormWorkflowInput,
    data: Any,
    document_nodes: list[Document],
    job_id: str,
    norm_examination_ids: NormExaminationIds,
) -> SatzOrchestratorWorkflowOutput:
    absatz_key = satz_info["absatz_key"]
    satz_key = satz_info["satz_key"]
    satz_index = satz_info["satz_index"]
    absatz_nr = satz_info["absatz_nr"]
    satz_nr = satz_info["satz_nr"]
    position = satz_info["position"]
    child_id = f"{job_id}--{absatz_key}-{satz_key}-{satz_index}"

    lookup_key = f"{absatz_nr}:{satz_nr}:{position}"
    satz_id = norm_examination_ids.satz_id_lookup.get(lookup_key)
    if not satz_id:
        raise RuntimeError(
            f"Satz {absatz_nr}:{satz_nr} at position {position} not found in examination service for norm {input.norm_id}"
        )

    child_input = SatzOrchestratorWorkflowInput(
        norm=norm,
        tbm=satz_info["tbm_text"],
        satz_id=satz_id,
        gesetz_id=norm_examination_ids.gesetz_id,
        norm_id=input.norm_id,
        data=data,
        project_id=input.project_id,
        normdetail_id=input.norm_id,
        document_nodes=document_nodes,
        max_concurrent_pageindex_svm=MAX_CONCURRENT_PAGEINDEX_SVM,
    )
    raw = await workflow.execute_child_workflow(
        SATZ_ORCHESTRATOR_WORKFLOW_ID,
        child_input,
        id=child_id,
        task_queue=SATZ_TASK_QUEUE,
        execution_timeout=timedelta(hours=6),
        task_timeout=timedelta(seconds=60),
        retry_policy=RetryPolicy(maximum_attempts=2),
    )

    return SatzOrchestratorWorkflowOutput.model_validate(raw)


@workflow.defn(name=SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID)
class SucheZuordnungNormWorkflow:
    """Spawns one SatzOrchestratorWorkflow child per Satz and collects all results."""

    @workflow.run
    async def run(self, input: SucheZuordnungNormWorkflowInput) -> SucheZuordnungNormWorkflowOutput:
        job_id = workflow.info().workflow_id

        # Fetch NormData from examination service if not provided in input
        data = input.data
        if data is None:
            workflow.logger.info("[NORM ORCHESTRATOR] Fetching NormData from examination service...")
            data = await fetch_norm_data(FetchNormDataInput(project_id=input.project_id, norm_id=input.norm_id))

        norm = derive_norm(data)
        saetze = collect_saetze(data)

        workflow.logger.info(
            "[SUZ NORM START] %s -- norm='%s', saetze=%d",
            job_id,
            norm[:80],
            len(saetze),
        )

        if not saetze:
            # Only raise if the norm contains materiell-rechtlich/wenn-dann Sätze
            # that should have TBMs but don't — otherwise return empty (e.g. procedural norms).
            should_have_tbms = any(
                satz.norm_typ_lvl_1 == "materiell-rechtlich" and satz.norm_typ_lvl_2 == "wenn-dann"
                for absatz in data.absaetze
                for satz in absatz.saetze
            )
            if should_have_tbms:
                raise RuntimeError(
                    "No Saetze with tatbestandsmerkmale found, but norm contains "
                    "materiell-rechtlich/wenn-dann Sätze that should have TBMs"
                )
            workflow.logger.info(
                "[SUZ NORM] No materiell-rechtlich/wenn-dann Sätze with TBMs — returning empty result",
            )
            return SucheZuordnungNormWorkflowOutput(norm=norm, satz_results=[])

        # Fetch document nodes and norm examination IDs in parallel
        workflow.logger.info("[SUZ NORM] Fetching document nodes and norm examination IDs...")
        document_nodes, norm_examination_ids = await asyncio.gather(
            fetch_document_nodes(FetchDocumentNodesInput(project_id=input.project_id)),
            fetch_norm_examination_ids(
                FetchNormExaminationIdsInput(
                    project_id=input.project_id,
                    norm_id=input.norm_id,
                )
            ),
        )
        workflow.logger.info(
            "[SUZ NORM] Fetched %d documents with %d total nodes; gesetz_id=%s, %d satz nodes mapped",
            len(document_nodes),
            sum(len(d.nodes) for d in document_nodes),
            norm_examination_ids.gesetz_id,
            len(norm_examination_ids.satz_id_lookup),
        )

        satz_results = await sliding_window(
            saetze,
            lambda satz_info: _run_satz_child(
                satz_info, norm, input, data, document_nodes, job_id, norm_examination_ids
            ),
            MAX_CONCURRENT_SATZ_CHILDREN,
        )
        await execute_insert_suche_zuordnung_results(
            InsertSucheZuordnungResultsInput(
                project_id=input.project_id,
                satz_orchestrator_outputs=satz_results,
            )
        )
        workflow.logger.info(
            "[SUZ NORM DONE] %s -- %d Satz child workflows completed",
            job_id,
            len(satz_results),
        )

        return SucheZuordnungNormWorkflowOutput(norm=norm, satz_results=satz_results)
