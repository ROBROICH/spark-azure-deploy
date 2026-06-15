"""Agent for Wortlaut-Auslegung of individual terms."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa_data_format import (
    WortlautAuslegerAgentOutput,
    WortlautAuslegerUnbestimmterRechtsbegriff,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa_prompt import (
    wa_agent_prompt,
    wa_agent_prompt_no_api,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow_types import (
    WortlautAuslegerAgentInput,
)


@workflow.defn(name="WortlautAuslegerAgentWorkflow")
class WortlautAuslegerAgentWorkflow:
    """Agent for the literal interpretation of unspecified legal terms."""

    @workflow.run
    async def run(
        self,
        input: WortlautAuslegerAgentInput,
    ) -> list[WortlautAuslegerUnbestimmterRechtsbegriff]:
        """Performs interpretation based on the wording."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": wa_agent_prompt if ENV.WIKTIONARY.ENABLED else wa_agent_prompt_no_api,
                "input_dict": {
                    "unbestimmte_rechtsbegriffe": [
                        wortlaut_processor.model_dump(exclude_defaults=True)
                        for wortlaut_processor in input.u_rechtsbegriffe
                    ],
                    "satz_text": input.satz_text,
                    "paragraph_text": input.paragraph_text,
                },
            },
            output_class=WortlautAuslegerAgentOutput.with_expected_length(len(input.u_rechtsbegriffe)),
        )

        return output.wortlaut_auslegung
