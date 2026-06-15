"""Agent for verifying unbestimmte Rechtsbegriffe candidates."""

from temporal.workflows.rechtsmethodik.types import UnbestimmterRechtsbegriff
from temporalio import workflow

from src.activities.law_api_calls import (
    DefinitionsByJurabkTitelInput,
    ld_table_get_definitions_by_jurabk_titel,
)
from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp_data_format import (
    UnbestimmteRechtsbegriffePrueferAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp_prompt import (
    urp_agent_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_types import (
    UnbestimmteRechtsbegriffePrueferAgentInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import get_matching_legal_terms


@workflow.defn(name="UnbestimmteRechtsbegriffePrueferAgentWorkflow")
class UnbestimmteRechtsbegriffePrueferAgentWorkflow:
    """Agent for verifying unspecified legal terms."""

    @workflow.run
    async def run(self, input: UnbestimmteRechtsbegriffePrueferAgentInput) -> list[UnbestimmterRechtsbegriff]:
        """Verifies the recognized unspecified legal terms."""
        if not input.ure_output:
            return []

        definitions = await ld_table_get_definitions_by_jurabk_titel(DefinitionsByJurabkTitelInput(jurabk=input.jurabk))

        matched_terms = list(
            get_matching_legal_terms(
                [entry.begriff for entry in input.ure_output],
                definitions,
                70.0,
            )
        )

        if not matched_terms:
            return input.ure_output

        bestimmte_rechtsbegriffe = [{"b_id": str(ind), "begriff": term.begriff} for ind, term in enumerate(matched_terms)]

        unbestimmte_rechtsbegriffe = [
            {"id": str(i), "begriff": entry.begriff} for i, entry in enumerate(input.ure_output)
        ]

        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": urp_agent_prompt,
                "input_dict": {
                    "unbestimmte_rechtsbegriffe": unbestimmte_rechtsbegriffe,
                    "bestimmte_rechtsbegriffe": bestimmte_rechtsbegriffe,
                },
            },
            output_class=UnbestimmteRechtsbegriffePrueferAgentOutput,
        )

        return self._build_u_begriffe(output)

    @staticmethod
    def _build_u_begriffe(
        output: UnbestimmteRechtsbegriffePrueferAgentOutput,
    ) -> list[UnbestimmterRechtsbegriff]:
        """Build UnbestimmterRechtsbegriff objects from LLM verification output."""
        return [
            UnbestimmterRechtsbegriff(begriff=entry.begriff, auslegungsvorschläge=[])
            for entry in output.pruefung
            if not entry.b_ids and not entry.bestimmt
        ]
