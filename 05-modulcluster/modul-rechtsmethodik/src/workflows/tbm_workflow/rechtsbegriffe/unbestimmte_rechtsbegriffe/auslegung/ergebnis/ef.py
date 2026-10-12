"""Agent for formulating the final Auslegungsergebnis."""

from temporal.contracts import (
    UnbestimmterRechtsbegriff,
)
from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef_data_format import (
    ErgebnisFormuliererAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef_prompt import (
    ef_agent_prompt,
)


@workflow.defn(name="ErgebnisFormuliererAgentWorkflow")
class ErgebnisFormuliererAgentWorkflow:
    """Agent for interpretation based on the norm history."""

    @workflow.run
    async def run(
        self,
        merged_ur: list[UnbestimmterRechtsbegriff],
    ) -> list[UnbestimmterRechtsbegriff]:
        """Generate final Auslegungsergebnis for each Rechtsbegriff."""
        if not merged_ur:
            return []

        async def _process(indexed_ur: tuple[int, UnbestimmterRechtsbegriff]) -> tuple[int, UnbestimmterRechtsbegriff]:
            """Invoke LLM to produce a single Ergebnis."""
            idx, ur = indexed_ur
            method_map = {av.auslegung_methode: av.auslegungsvorschlag for av in ur.auslegungsvorschläge}
            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.LARGE_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": ef_agent_prompt,
                    "input_dict": {
                        "unbestimmter_rechtsbegriff": ur.begriff,
                        "wortlaut": method_map["wortlaut"],
                        "systematik": method_map["systematik"],
                        "historie": method_map["historie"],
                        "telos": method_map["telos"],
                    },
                },
                output_class=ErgebnisFormuliererAgentOutput,
            )

            return idx, UnbestimmterRechtsbegriff(
                begriff=ur.begriff,
                auslegungsvorschläge=ur.auslegungsvorschläge,
                auslegung=output.auslegung,
            )

        indexed_results = await sliding_window(list(enumerate(merged_ur)), _process, concurrency=10)
        indexed_results.sort(key=lambda x: x[0])
        return [result for _, result in indexed_results]
