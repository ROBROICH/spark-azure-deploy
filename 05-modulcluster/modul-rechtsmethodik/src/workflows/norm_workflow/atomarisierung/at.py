"""Agent for decomposing legal constituents into atomic Tatbestandsmerkmale."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.atomarisierung.at_data_format import (
    AtomarisierungsAgentOutput,
)
from src.workflows.norm_workflow.atomarisierung.at_prompt import (
    atomarisierungs_agent_prompt,
)
from src.workflows.norm_workflow.norm_types import AtomarisierungsAgentInput


@workflow.defn(name="AtomarisierungsAgentWorkflow")
class AtomarisierungsAgentWorkflow:
    """Agent for breaking down legal constituents into atomic components."""

    @workflow.run
    async def run(self, input: AtomarisierungsAgentInput) -> list[str]:
        """Invoke LLM to atomize TBMs for a given Satz."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": atomarisierungs_agent_prompt,
                "input_dict": {
                    "satz_text": input.satz_text,
                    "tatbestandsmerkmale": input.tatbestandsmerkmale,
                },
            },
            output_class=AtomarisierungsAgentOutput,
        )

        return output.tatbestandsmerkmale
