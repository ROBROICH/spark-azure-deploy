"""LLM agent for extracting legal definitions from norm text."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.legal_definitionen.erkennung.lde_data_format import (
    LegalDefinitionenExtrahiererAgentInput,
    LegalTermsList,
    LegalTermsListEntry,
)
from src.workflows.legal_definitionen.erkennung.lde_prompt import (
    lde_agent_allgemeiner_paragraph_prompt,
    lde_agent_begriffsbestimmungen_prompt,
)


@workflow.defn(name="LegalDefinitionenExtrahiererAgentWorkflow")
class LegalDefinitionenExtrahiererAgent:
    """Agent for extracting legal definitions from the laws.

    Uses two different prompts depending on the paragraph type:
    - Begriffsbestimmungen paragraphs (ist_begriffsbestimmungen=True): paragraphs whose
      primary purpose is to define legal terms (e.g. "§ 7 Begriffsbestimmungen BNatSchG").
    - General paragraphs (ist_begriffsbestimmungen=False): regular paragraphs that may
      contain incidental definitions but are not dedicated definition sections.
    """

    @workflow.run
    async def run(self, input: LegalDefinitionenExtrahiererAgentInput) -> list[LegalTermsListEntry]:
        """Invoke LLM to extract legal definitions from a text chunk."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": lde_agent_begriffsbestimmungen_prompt
                if input.ist_begriffsbestimmungen
                else lde_agent_allgemeiner_paragraph_prompt,
                "input_dict": {
                    "paragraph_text": input.paragraph_text,
                },
            },
            output_class=LegalTermsList,
        )

        return output.rechtsbegriffe
