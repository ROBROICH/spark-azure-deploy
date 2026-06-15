"""Orchestrator for Adressaten and Ermessen analysis sub-workflows."""

from datetime import timedelta

from temporal.workflows.rechtsmethodik.types import ERMESSENSENTSCHEIDUNG, HANDLUNGSERMAECHTIGUNG
from temporalio import workflow

from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea import (
    ErmessensArtAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei import (
    ErmessensIdentifikationsAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra import (
    RechtsfolgenAdressatenAgentWorkflow,
)
from src.workflows.rf_workflow.rf_types import AdressatenErmessenWorkflowOutput


@workflow.defn(name="AdressatenErmessenWorkflow")
class AdressatenErmessenWorkflow:
    """
    Workflow for analyzing legal consequences with regard to addressees,
    scope of discretion, and type of discretion.
    """

    @workflow.run
    async def run(self, rechtsfolge: str) -> AdressatenErmessenWorkflowOutput:
        """Analyze addressee, discretion scope, and discretion type for the given Rechtsfolge."""
        ra_output = await workflow.execute_child_workflow(
            RechtsfolgenAdressatenAgentWorkflow.run,
            rechtsfolge,
            task_timeout=timedelta(seconds=60),
        )

        if ra_output != HANDLUNGSERMAECHTIGUNG:
            return AdressatenErmessenWorkflowOutput(
                text=rechtsfolge,
                rechtsfolgen_adressat=ra_output,
            )

        ei_output = await workflow.execute_child_workflow(
            ErmessensIdentifikationsAgentWorkflow.run, rechtsfolge, task_timeout=timedelta(seconds=60)
        )

        if ei_output != ERMESSENSENTSCHEIDUNG:
            return AdressatenErmessenWorkflowOutput(
                text=rechtsfolge,
                rechtsfolgen_adressat=ra_output,
                ermessensspielraum=ei_output,
            )

        ea_output = await workflow.execute_child_workflow(
            ErmessensArtAgentWorkflow.run, rechtsfolge, task_timeout=timedelta(seconds=60)
        )

        return AdressatenErmessenWorkflowOutput(
            text=rechtsfolge,
            rechtsfolgen_adressat=ra_output,
            ermessensspielraum=ei_output,
            ermessensart=ea_output,
        )
