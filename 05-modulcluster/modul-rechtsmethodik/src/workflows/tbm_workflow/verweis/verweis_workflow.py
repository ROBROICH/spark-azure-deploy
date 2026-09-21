"""Orchestrator for explicit and implicit Verweis analysis."""

import asyncio
from datetime import timedelta

from temporal.workflows.rechtsmethodik.types import Verweise
from temporalio import workflow

from src.workflows.tbm_workflow.tbm_types import VerweisWorkflowInput
from src.workflows.tbm_workflow.verweis.utils import (
    fetch_context_for_verweise,
    postprocess_explizite_verweise,
)
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve import (
    VerweisExplizitAgentWorkflow,
)
from src.workflows.tbm_workflow.verweis.verweis_implizit.vi import (
    VerweisImplizitAgentWorkflow,
)
from src.workflows.tbm_workflow.verweis.verweis_types import VerweisAgentInputExplizit, VerweisAgentInputImplizit


@workflow.defn(name="VerweisWorkflow")
class VerweisWorkflow:
    """Conducts an analysis of legal norms with a focus on extracting references."""

    @workflow.run
    async def run(self, input: VerweisWorkflowInput) -> tuple[list[Verweise], Verweise]:
        """Run explicit and implicit Verweis extraction in parallel and merge results."""
        all_verweise, (vi_tbms, vi_rf) = await asyncio.gather(
            workflow.execute_child_workflow(
                VerweisExplizitAgentWorkflow.run,
                VerweisAgentInputExplizit(
                    gesetz=input.gesetz,
                    paragraph_nr=input.paragraph_nr,
                    atomare_tatbestandsmerkmale=input.atomare_tatbestandsmerkmale,
                    rechtsfolge=input.rechtsfolge,
                ),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                VerweisImplizitAgentWorkflow.run,
                VerweisAgentInputImplizit(
                    satz_text=input.satz_text,
                    atomare_tatbestandsmerkmale=input.atomare_tatbestandsmerkmale,
                    rechtsfolge=input.rechtsfolge,
                ),
                task_timeout=timedelta(seconds=60),
            ),
        )

        ve_a_tbms, ve_rf = await postprocess_explizite_verweise(all_verweise, input)

        ve_a_tbms_w_context, ve_rf_w_context = await fetch_context_for_verweise(ve_a_tbms, ve_rf)

        verweis_output_tbms = []
        for ind in range(len(input.atomare_tatbestandsmerkmale)):
            verweis_output_tbms.append(Verweise(explizit=ve_a_tbms_w_context[ind], implizit=vi_tbms[ind]))
        verweis_output_rf = Verweise(explizit=ve_rf_w_context, implizit=vi_rf)

        return verweis_output_tbms, verweis_output_rf
