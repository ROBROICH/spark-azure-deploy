"""Agent for identifying Rechtsfolgen-Adressaten."""

from temporal.workflows.rechtsmethodik.types import RechtsfolgenAdressat
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra_data_format import (
    RechtsfolgenAdressatenAgentOutputFormat,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra_prompt import (
    rechtsfolgen_adressaten_agent_prompt_template,
)


@workflow.defn(name="RechtsfolgenAdressatenAgentWorkflow")
class RechtsfolgenAdressatenAgentWorkflow:
    """
    Agent for analyzing legal consequences with regard to their addressee.
    """

    @workflow.run
    async def run(self, rechtsfolge: str) -> RechtsfolgenAdressat:
        """Identify the addressee of the given legal consequence."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.SMALL_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": rechtsfolgen_adressaten_agent_prompt_template,
                "input_dict": {"rechtsfolge": rechtsfolge},
            },
            output_class=RechtsfolgenAdressatenAgentOutputFormat,
        )

        return output.entscheidung
