"""Agent for historische Auslegung."""

from temporal.utils import sliding_window
from temporal.workflows.rechtsmethodik.types import (
    Auslegungsvorschlag,
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    HistorieAuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha_data_format import (
    HistorieAuslegerAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha_prompt import (
    ha_agent_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import format_legal_source


@workflow.defn(name="HistorieAuslegerAgentWorkflow")
class HistorieAuslegerAgentWorkflow:
    """Agent for interpretation based on the norm history."""

    @workflow.run
    async def run(
        self,
        input: HistorieAuslegerAgentInput,
    ) -> list[UnbestimmterRechtsbegriff]:
        """Run historische Auslegung for each Rechtsbegriff."""
        if not input.enriched_urp:
            return []

        normstelle = format_legal_source(
            jurabk=input.jurabk,
            paragraph_nr=input.paragraph_nr,
            absatz_nr=input.absatz_nr,
            satz_nr=input.satz_nr,
            markers=input.markers,
        )

        async def _process(
            indexed_ur: tuple[int, UnbestimmterRechtsbegriffWithContext],
        ) -> tuple[int, UnbestimmterRechtsbegriff]:
            """Process a single Rechtsbegriff through historische Auslegung."""
            idx, ur = indexed_ur
            output = await self._invoke_ha_llm_or_fallback(ur, normstelle, input)
            return idx, UnbestimmterRechtsbegriff(
                begriff=ur.begriff,
                auslegungsvorschläge=[
                    Auslegungsvorschlag(
                        auslegung_methode="historie",
                        auslegungsvorschlag=output.historische_auslegung,
                    )
                ],
            )

        indexed_results = await sliding_window(list(enumerate(input.enriched_urp)), _process, concurrency=10)
        indexed_results.sort(key=lambda x: x[0])
        return [result for _, result in indexed_results]

    async def _invoke_ha_llm_or_fallback(
        self, ur: UnbestimmterRechtsbegriffWithContext, normstelle: str, input: HistorieAuslegerAgentInput
    ) -> HistorieAuslegerAgentOutput:
        """Call LLM for historische Auslegung, fallback on missing context."""
        if not (ur.d_context or ur.u_context):
            return HistorieAuslegerAgentOutput(
                historische_auslegung=(
                    "Die semantische Suche hat keine einschlägigen Materialien zur "
                    "historischen Auslegung des unbestimmten Rechtsbegriffs identifiziert "
                    "und war in diesem Sinne unergiebig."
                )
            )

        return await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": ha_agent_prompt,
                "input_dict": {
                    "normstelle": normstelle,
                    "satz_text": input.satz_text,
                    "unbestimmter_rechtsbegriff": ur.begriff,
                    "quellen": {
                        "gesetzesbegruendungen": [d.model_dump() for d in ur.d_context],
                        "entscheidungen": [
                            {
                                "gericht": u_entry.gericht,
                                "datum": u_entry.datum,
                                "aktenzeichen": u_entry.aktenzeichen,
                                "randnummer": u_entry.section_number,
                                "text": u_entry.section_text,
                                "zitierte_entscheidungen": [z_u.model_dump() for z_u in u_entry.zitierte_urteile],
                            }
                            for u_entry in ur.u_context
                        ],
                    },
                },
            },
            output_class=HistorieAuslegerAgentOutput,
        )
