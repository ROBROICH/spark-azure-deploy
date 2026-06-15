"""Agent for constructing the Rechtsfolge from raw components."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.norm_types import RechtsfolgeKonstrukteurAgentInput
from src.workflows.norm_workflow.rf_konstrukteur.rk_data_format import (
    RechtsfolgeKonstrukteurAgentOutput,
)
from src.workflows.norm_workflow.rf_konstrukteur.rk_prompt import rk_agent_prompt


@workflow.defn(name="RechtsfolgeKonstrukteurAgentWorkflow")
class RechtsfolgeKonstrukteurAgentWorkflow:
    """Agent for reformulating legal consequences into a complete sentence."""

    @workflow.run
    async def run(self, input: RechtsfolgeKonstrukteurAgentInput) -> str:
        """Invoke LLM to construct the Rechtsfolge from raw components."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": rk_agent_prompt,
                "input_dict": {
                    "satz_text": input.satz_text,
                    "rechtsfolgen_raw": input.rechtsfolgen_raw,
                },
            },
            output_class=RechtsfolgeKonstrukteurAgentOutput,
        )

        return output.rechtsfolge_neu
