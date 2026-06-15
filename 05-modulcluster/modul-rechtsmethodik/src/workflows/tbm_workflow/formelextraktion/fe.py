"""Agent for extracting logical formulas from norm text."""

import re

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.formelextraktion.fe_data_format import (
    FormelextrahiererAgentOutput,
)
from src.workflows.tbm_workflow.formelextraktion.fe_prompt import (
    formelextrahierer_agent_prompt,
)
from src.workflows.tbm_workflow.tbm_types import FormelextrahiererAgentInput


@workflow.defn(name="FormelExtrahiererAgentWorkflow")
class FormelExtrahiererAgentWorkflow:
    """Agent for deriving predicate logic formulas."""

    @workflow.run
    async def run(self, input: FormelextrahiererAgentInput) -> str:
        """Derives predicate logic formulas from legal sentences."""

        a_tbms_mit_ids = [
            {"id": f"TBM_{j}", "tatbestandsmerkmal": tbm}
            for j, tbm in enumerate(input.atomare_tatbestandsmerkmale, start=1)
        ]

        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.MEDIUM_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": formelextrahierer_agent_prompt,
                "input_dict": {
                    "atomare_tatbestandsmerkmale": a_tbms_mit_ids,
                    "satz_text": input.satz_text,
                    "rechtsfolge": input.rechtsfolge,
                    "number_of_tbms": len(a_tbms_mit_ids),
                },
            },
            output_class=FormelextrahiererAgentOutput,
        )
        return self._to_german_text(output.formel)

    @staticmethod
    def _to_german_text(formel: str) -> str:
        """Replace logic operators with German words."""
        formel = formel.replace("∧", " und ").replace("∨", " oder ").replace("¬", "nicht ")  # noqa: RUF001
        return re.sub(r"\s+", " ", formel).strip()
