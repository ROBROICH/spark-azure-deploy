"""Agent for classifying Satz-Kategorie (wenn-dann, etc.)."""

from temporal.workflows.rechtsmethodik.types import SatzKategorie
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.satz_kategorie.sk_data_format import (
    SatzKategorieAgentOutput,
)
from src.workflows.norm_workflow.satz_kategorie.sk_prompt import (
    satz_kategorie_prompt,
)


@workflow.defn(name="SatzKategorieAgentWorkflow")
class SatzKategorieAgentWorkflow:
    """Agent for categorizing legal sentences."""

    @workflow.run
    async def run(self, satz_text: str) -> SatzKategorie:
        """Categorize the given legal sentence into a rechtsmethodische Kategorie."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": satz_kategorie_prompt,
                "input_dict": {"satz_text": satz_text},
            },
            output_class=SatzKategorieAgentOutput,
        )
        return output.kategorie
