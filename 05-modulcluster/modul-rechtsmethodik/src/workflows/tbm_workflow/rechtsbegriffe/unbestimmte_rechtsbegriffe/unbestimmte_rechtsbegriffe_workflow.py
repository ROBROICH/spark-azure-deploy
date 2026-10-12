"""Orchestrator for unbestimmte Rechtsbegriffe detection and interpretation."""

from datetime import timedelta

from temporal.contracts import (
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_types import UnbestimmteRechtsbegriffeWorkflowInput
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_workflow import (
    AuslegungWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure import (
    UnbestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp import (
    UnbestimmteRechtsbegriffePrueferAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_types import (
    AuslegungWorkflowInput,
    UnbestimmteRechtsbegriffePrueferAgentInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import (
    assign_begriffe_to_a_tbms,
    filter_rechtsbegriffe_by_assignment,
)


@workflow.defn(name="UnbestimmteRechtsbegriffeWorkflow")
class UnbestimmteRechtsbegriffeWorkflow:
    """Conducts an analysis of legal norms with a focus on unspecified legal terms."""

    @workflow.run
    async def run(self, input: UnbestimmteRechtsbegriffeWorkflowInput) -> list[list[UnbestimmterRechtsbegriff]]:
        """Detect, verify, and interpret unbestimmte Rechtsbegriffe in TBMs."""
        ure_output = await workflow.execute_child_workflow(
            UnbestimmteRechtsbegriffeErkennerAgentWorkflow.run,
            input.satz_text,
            task_timeout=timedelta(seconds=60),
        )

        urp_output = await workflow.execute_child_workflow(
            UnbestimmteRechtsbegriffePrueferAgentWorkflow.run,
            UnbestimmteRechtsbegriffePrueferAgentInput(ure_output=ure_output, jurabk=input.jurabk),
            task_timeout=timedelta(seconds=60),
        )

        urp_output = filter_rechtsbegriffe_by_assignment(input.atomare_tatbestandsmerkmale, urp_output, threshold=90.0)
        if not urp_output:
            return [[] for _ in input.atomare_tatbestandsmerkmale]

        auslegung_workflow_output = await workflow.execute_child_workflow(
            AuslegungWorkflow.run,
            AuslegungWorkflowInput(
                jurabk=input.jurabk,
                paragraph_nr=input.paragraph_nr,
                paragraph_text=input.paragraph_text,
                absatz_nr=input.absatz_nr,
                satz_nr=input.satz_nr,
                markers=input.markers,
                satz_text=input.satz_text,
                urp_output=urp_output,
            ),
            task_timeout=timedelta(seconds=60),
        )

        return assign_begriffe_to_a_tbms(
            input.atomare_tatbestandsmerkmale,
            auslegung_workflow_output,
            threshold=90.0,
        )
