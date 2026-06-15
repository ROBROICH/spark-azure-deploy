"""Agent for recognizing unbestimmte Rechtsbegriffe in TBMs."""

from temporal.workflows.rechtsmethodik.types import UnbestimmterRechtsbegriff
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure_data_format import (
    UnbestimmteRechtsbegriffeErkennerAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure_prompt import (
    ure_agent_prompt,
)


@workflow.defn(name="UnbestimmteRechtsbegriffeErkennerAgentWorkflow")
class UnbestimmteRechtsbegriffeErkennerAgentWorkflow:
    """Agent for recognizing unspecified legal terms."""

    @workflow.run
    async def run(self, satz_text: str) -> list[UnbestimmterRechtsbegriff]:
        """Recognizes unspecified legal terms."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": ure_agent_prompt,
                "input_dict": {
                    "satz_text": satz_text,
                },
            },
            output_class=UnbestimmteRechtsbegriffeErkennerAgentOutput,
        )

        return [
            UnbestimmterRechtsbegriff(begriff=entry, auslegungsvorschläge=[])
            for entry in output.unbestimmte_rechtsbegriffe
        ]
