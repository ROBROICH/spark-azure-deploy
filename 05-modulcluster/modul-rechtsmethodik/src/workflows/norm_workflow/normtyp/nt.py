"""Agent for classifying norm types (materiell-rechtlich vs formell)."""

from temporal.workflows.rechtsmethodik.types import NormTyp
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.normtyp.nt_data_format import NormTypAgentOutput
from src.workflows.norm_workflow.normtyp.nt_prompt import (
    norm_typ_agent_prompt,
)


@workflow.defn(name="NormTypAgentWorkflow")
class NormTypAgentWorkflow:
    """Agent for classifying norm types."""

    @workflow.run
    async def run(self, satz_text: str) -> NormTyp:
        """Classify the norm type of the given sentence."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": norm_typ_agent_prompt,
                "input_dict": {"satz_text": satz_text},
            },
            output_class=NormTypAgentOutput,
        )
        return output.norm_typ
