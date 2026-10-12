"""Orchestrator for the Wortlaut-Auslegung pipeline."""

from datetime import timedelta

from temporal.contracts import (
    Auslegungsvorschlag,
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    WortlautAuslegungWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa import (
    WortlautAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa_data_format import (
    WortlautAuslegerUnbestimmterRechtsbegriff,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we import (
    WortlautWordExtractorAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow_types import (
    WortlautAuslegerAgentInput,
    WortlautProcessor,
)


@workflow.defn(name="WortlautAuslegungWorkflow")
class WortlautAuslegungWorkflow:
    """Workflow for the literal interpretation of unspecified legal terms."""

    @workflow.run
    async def run(
        self,
        input: WortlautAuslegungWorkflowInput,
    ) -> list[UnbestimmterRechtsbegriff]:
        """Execute Wortlaut-Auslegung pipeline: extract words then interpret each."""
        if not input.enriched_urp:
            return []

        wa_output: list[UnbestimmterRechtsbegriff] = [
            UnbestimmterRechtsbegriff(
                begriff=entry.begriff,
                auslegungsvorschläge=entry.auslegungsvorschläge,
            )
            for entry in input.enriched_urp
        ]

        u_rechtsbegriffe = [
            WortlautProcessor(id=str(i), u_begriff=entry.begriff) for i, entry in enumerate(input.enriched_urp)
        ]

        word_extractor_output = await workflow.execute_child_workflow(
            WortlautWordExtractorAgentWorkflow.run, u_rechtsbegriffe,
            task_timeout=timedelta(seconds=60),
        )

        wortlaut_ausleger_output = await workflow.execute_child_workflow(
            WortlautAuslegerAgentWorkflow.run,
            WortlautAuslegerAgentInput(
                satz_text=input.satz_text,
                paragraph_text=input.paragraph_text,
                u_rechtsbegriffe=word_extractor_output,
            ),
            task_timeout=timedelta(seconds=60),
        )

        return self._apply_auslegungen(wa_output, wortlaut_ausleger_output)

    @staticmethod
    def _apply_auslegungen(
        wa_output: list[UnbestimmterRechtsbegriff],
        wortlaut_ausleger_output: list[WortlautAuslegerUnbestimmterRechtsbegriff],
    ) -> list[UnbestimmterRechtsbegriff]:
        """Map LLM interpretations back to their source Rechtsbegriffe."""
        for i, w_auslegung in enumerate(wortlaut_ausleger_output):
            wa_output[i] = UnbestimmterRechtsbegriff(
                begriff=w_auslegung.u_begriff,
                auslegungsvorschläge=[
                    Auslegungsvorschlag(auslegung_methode="wortlaut", auslegungsvorschlag=w_auslegung.auslegung)
                ],
            )
        return wa_output
