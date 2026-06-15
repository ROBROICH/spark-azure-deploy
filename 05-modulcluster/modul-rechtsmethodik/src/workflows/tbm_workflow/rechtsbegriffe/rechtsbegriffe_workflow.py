"""Orchestrator for bestimmte and unbestimmte Rechtsbegriffe analysis."""

from datetime import timedelta

from temporal.workflows.rechtsmethodik.types import (
    Rechtsbegriffe,
)
from temporalio import workflow

from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre import (
    BestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_types import (
    BestimmteRechtsbegriffeErkennerAgentInput,
    UnbestimmteRechtsbegriffeWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_workflow import (
    UnbestimmteRechtsbegriffeWorkflow,
)
from src.workflows.tbm_workflow.tbm_types import (
    RechtsbegriffeWorkflowInput,
)


@workflow.defn(name="RechtsbegriffeWorkflow")
class RechtsbegriffeWorkflow:
    """Conducts an analysis of legal norms with a focus on legal terms."""

    @workflow.run
    async def run(self, input: RechtsbegriffeWorkflowInput) -> list[Rechtsbegriffe]:
        """Run bestimmte and unbestimmte Rechtsbegriffe workflows in parallel and merge results."""
        bre_output, ur_workflow_output = await workflow.asyncio.gather(
            workflow.execute_child_workflow(
                BestimmteRechtsbegriffeErkennerAgentWorkflow.run,
                BestimmteRechtsbegriffeErkennerAgentInput(
                    jurabk=input.jurabk,
                    satz_text=input.satz_text,
                    atomare_tatbestandsmerkmale=input.atomare_tatbestandsmerkmale,
                ),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                UnbestimmteRechtsbegriffeWorkflow.run,
                UnbestimmteRechtsbegriffeWorkflowInput(
                    jurabk=input.jurabk,
                    paragraph_nr=input.paragraph_nr,
                    paragraph_text=input.paragraph_text,
                    absatz_nr=input.absatz_nr,
                    satz_nr=input.satz_nr,
                    markers=input.markers,
                    satz_text=input.satz_text,
                    atomare_tatbestandsmerkmale=input.atomare_tatbestandsmerkmale,
                ),
                task_timeout=timedelta(seconds=60),
            ),
        )

        return [
            Rechtsbegriffe(
                bestimmte_rechtsbegriffe=bre_output[ind],
                unbestimmte_rechtsbegriffe=ur_workflow_output[ind],
            )
            for ind in range(len(input.atomare_tatbestandsmerkmale))
        ]
