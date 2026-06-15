"""Agent for classifying Urteile by relevance."""

from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UnbestimmterRechtsbegriffWithContext,
    UrteilKlassifikationInput,
    UTChunk,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk_data_format import (
    AUSLEGUNGS_METHODEN,
    AuslegungsMethode,
    UrteilKlassifikationOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk_prompt import (
    uk_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import (
    format_legal_source,
)


@workflow.defn(name="UrteilKlassifikationWorkflow")
class UrteilKlassifikationAgentWorkflow:
    """Classifies retrieved Urteils-Chunks by Auslegungsmethode."""

    @workflow.run
    async def run(
        self,
        input: UrteilKlassifikationInput,
    ) -> list[dict[AuslegungsMethode, list[UTChunk]]]:
        """Classify chunks for each Rechtsbegriff and return method-grouped results.

        Returns a list (one entry per Rechtsbegriff) of dicts mapping each
        AuslegungsMethode to its relevant UTChunks.
        """
        normstelle = format_legal_source(
            input.jurabk, input.paragraph_nr, input.absatz_nr, input.satz_nr, input.markers
        )

        async def _classify(
            indexed_ur: tuple[int, UnbestimmterRechtsbegriffWithContext],
        ) -> tuple[int, dict[AuslegungsMethode, list[UTChunk]]]:
            """Invoke LLM to classify Urteile by relevance."""
            idx, ur = indexed_ur
            if not ur.u_context:
                return idx, {m: [] for m in AUSLEGUNGS_METHODEN}

            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.SMALL_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": uk_prompt,
                    "input_dict": {
                        "unbestimmter_rechtsbegriff": ur.begriff,
                        "satz_text": input.satz_text,
                        "normstelle": normstelle,
                        "entscheidungen": [
                            {
                                "aktenzeichen": c.aktenzeichen,
                                "randnummer": c.section_number,
                                "gericht": c.gericht,
                                "datum": c.datum,
                                "text": c.section_text,
                                "zitierte_entscheidungen": [z.model_dump() for z in c.zitierte_urteile],
                            }
                            for c in ur.u_context
                        ],
                    },
                },
                output_class=UrteilKlassifikationOutput.with_expected_length(len(ur.u_context)),
            )

            chunk_lookup: dict[tuple[str, str], UTChunk] = {(c.aktenzeichen, c.section_number): c for c in ur.u_context}

            grouped: dict[AuslegungsMethode, list[UTChunk]] = {m: [] for m in AUSLEGUNGS_METHODEN}
            for k in output.klassifikationen:
                chunk = chunk_lookup.get((k.aktenzeichen, k.randnummer))
                if chunk:
                    for methode in k.methoden:
                        grouped[methode].append(chunk)

            return idx, grouped

        indexed_results = await sliding_window(list(enumerate(input.enriched_urp)), _classify, concurrency=10)
        indexed_results.sort(key=lambda x: x[0])
        return [result for _, result in indexed_results]
