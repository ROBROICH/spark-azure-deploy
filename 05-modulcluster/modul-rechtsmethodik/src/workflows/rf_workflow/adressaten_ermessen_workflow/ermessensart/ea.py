"""Agent for classifying the type of discretion (Ermessensart)."""

from temporal.workflows.rechtsmethodik.types import ErmessensArt
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea_data_format import (
    ErmessensArtAgentOutputFormat,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea_prompt import (
    ermessensart_agent_prompt,
)


@workflow.defn(name="ErmessensArtAgentWorkflow")
class ErmessensArtAgentWorkflow:
    """
    Agent for the classification of the type of discretion (Ermessensart).
    """

    @workflow.run
    async def run(
        self,
        rechtsfolge: str,
    ) -> ErmessensArt:
        """Classify the type of discretion (Ermessensart) for the given Rechtsfolge."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": ermessensart_agent_prompt,
                "input_dict": {"rechtsfolge": rechtsfolge},
            },
            output_class=ErmessensArtAgentOutputFormat,
        )

        return output.entscheidung
