"""Agent for identifying the Regelungsgegenstand of a norm."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowInput
from src.workflows.norm_workflow.regelungsgegenstand.rgi_data_format import (
    RegelungsgegenstandsIdentifikatorOutput,
)
from src.workflows.norm_workflow.regelungsgegenstand.rgi_prompt import (
    regelungsgegenstands_identifikator_prompt,
)


@workflow.defn(name="RegelungsgegenstandsIdentifikatorAgentWorkflow")
class RegelungsgegenstandsIdentifikatorAgentWorkflow:
    """Agent for determining the subject matter of a legal paragraph."""

    @workflow.run
    async def run(self, input: NormDekonstruktionWorkflowInput) -> str | None:
        """Invoke LLM to identify the Regelungsgegenstand."""
        if input.paragraph_text:
            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.LARGE_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": regelungsgegenstands_identifikator_prompt,
                    "input_dict": input.model_dump(),
                },
                output_class=RegelungsgegenstandsIdentifikatorOutput,
            )

            return output.regelungsgegenstand

        return None
