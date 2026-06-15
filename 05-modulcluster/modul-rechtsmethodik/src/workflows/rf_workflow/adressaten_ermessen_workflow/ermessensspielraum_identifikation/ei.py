"""Agent for identifying Ermessensspielraum."""

from temporal.workflows.rechtsmethodik.types import Ermessensspielraum
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei_data_format import (
    ErmessensspielraumAgentOutputFormat,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei_prompt import (
    ermessensspielraum_agent_prompt,
)


@workflow.defn(name="ErmessensIdentifikationsAgentWorkflow")
class ErmessensIdentifikationsAgentWorkflow:
    """Agent for identifying whether a legal consequence grants discretion (Ermessensspielraum)."""

    @workflow.run
    async def run(
        self,
        rechtsfolge: str,
    ) -> Ermessensspielraum:
        """Identify whether the given Rechtsfolge implies Ermessensspielraum."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.SMALL_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": ermessensspielraum_agent_prompt,
                "input_dict": {"rechtsfolge": rechtsfolge},
            },
            output_class=ErmessensspielraumAgentOutputFormat,
        )

        return output.entscheidung
