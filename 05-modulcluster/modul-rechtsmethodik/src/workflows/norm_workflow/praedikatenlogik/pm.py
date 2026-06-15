"""Agent for predicate logic extraction of TBMs and Rechtsfolge."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.praedikatenlogik.pm_data_format import (
    PraedikatenlogikModelliererAgentOutput,
)
from src.workflows.norm_workflow.praedikatenlogik.pm_prompt import (
    praedikatenlogik_modellierer_prompt,
)


@workflow.defn(name="PraedikatenlogikModelliererAgentWorkflow")
class PraedikatenlogikModelliererAgentWorkflow:
    """Agent for recognizing If-Then structures in legal sentences."""

    @workflow.run
    async def run(self, satz_text: str) -> tuple[list[str], list[str]]:
        """Extract Tatbestandsmerkmale and Rechtsfolgen from the given sentence."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.SMALL_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": praedikatenlogik_modellierer_prompt,
                "input_dict": {"satz_text": satz_text},
            },
            output_class=PraedikatenlogikModelliererAgentOutput,
        )

        return output.tatbestandsmerkmale, output.rechtsfolgen
