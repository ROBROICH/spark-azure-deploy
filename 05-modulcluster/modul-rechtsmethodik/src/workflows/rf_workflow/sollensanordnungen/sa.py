"""Agent for classifying Sollensanordnungen."""

from temporal.workflows.rechtsmethodik.types import Sollensanordnungen
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.rf_workflow.sollensanordnungen.sa_data_format import (
    SollensanordnungenAgentOutputFormat,
)
from src.workflows.rf_workflow.sollensanordnungen.sa_prompt import (
    sollensanordnungen_agent_prompt,
)


@workflow.defn(name="SollensanordnungsAgentWorkflow")
class SollensanordnungsAgentWorkflow:
    """
    Agent for the analysis of 'Sollensanordnungen'.
    """

    @workflow.run
    async def run(self, rechtsfolge: str) -> Sollensanordnungen:
        """Classify the Sollensanordnung type of the given legal consequence."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": sollensanordnungen_agent_prompt,
                "input_dict": {"rechtsfolge": rechtsfolge},
            },
            output_class=SollensanordnungenAgentOutputFormat,
        )

        return output.kategorie
