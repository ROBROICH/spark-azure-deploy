"""Agent for identifying bestimmte Rechtsbegriffe."""

from temporal.workflows.rechtsmethodik.types import BestimmterRechtsbegriff, Legaldefinition
from temporalio import workflow

from src.activities.law_api_calls import (
    DefinitionsByJurabkTitelInput,
    LegaldefinitionOutput,
    ld_table_get_definitions_by_jurabk_titel,
)
from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre_data_format import (
    BestimmteRechtsbegriffeErkennerAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre_prompt import (
    bre_agent_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_types import BestimmteRechtsbegriffeErkennerAgentInput
from src.workflows.tbm_workflow.rechtsbegriffe.utils import assign_begriffe_to_a_tbms, get_matching_legal_terms


@workflow.defn(name="BestimmteRechtsbegriffeErkennerAgentWorkflow")
class BestimmteRechtsbegriffeErkennerAgentWorkflow:
    """Agent for recognizing specific legal terms."""

    @workflow.run
    async def run(
        self,
        input: BestimmteRechtsbegriffeErkennerAgentInput,
    ) -> list[list[BestimmterRechtsbegriff]]:
        """Recognizes specific legal terms."""
        definitions = await ld_table_get_definitions_by_jurabk_titel(
            DefinitionsByJurabkTitelInput(
                jurabk=input.jurabk,
            )
        )

        matched_terms = list(get_matching_legal_terms([input.satz_text], definitions, 90.0))

        if not matched_terms:
            return [[] for _ in range(len(input.atomare_tatbestandsmerkmale))]

        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": bre_agent_prompt,
                "input_dict": {
                    "satz_text": input.satz_text,
                    "bestimmte_rechtsbegriffe": [
                        {"id": str(ind), "begriff": term.begriff} for ind, term in enumerate(matched_terms)
                    ],
                },
            },
            output_class=BestimmteRechtsbegriffeErkennerAgentOutput,
        )

        gefundene_bestimmte_rechtsbegriffe = self._build_gefundene_begriffe(
            matched_terms, output, input.jurabk
        )

        return assign_begriffe_to_a_tbms(
            input.atomare_tatbestandsmerkmale, gefundene_bestimmte_rechtsbegriffe, threshold=85.0
        )

    @staticmethod
    def _build_gefundene_begriffe(
        matched_terms: list[LegaldefinitionOutput],
        output: BestimmteRechtsbegriffeErkennerAgentOutput,
        jurabk: str,
    ) -> list[BestimmterRechtsbegriff]:
        """Match LLM-identified terms against the definition table."""
        return [
            BestimmterRechtsbegriff(
                begriff=matched_terms[int(r_id)].begriff,
                definitions=[
                    Legaldefinition(
                        begriff=matched_terms[int(r_id)].begriff,
                        definition=matched_terms[int(r_id)].definition,
                        source={
                            "jurabk": jurabk,
                            "paragraph_nr": matched_terms[int(r_id)].paragraph_nr,
                        },
                    )
                ],
            )
            for r_id in output.begriffe
        ]
