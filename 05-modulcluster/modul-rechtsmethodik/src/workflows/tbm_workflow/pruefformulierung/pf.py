"""Agent for generating Pruefformulierungen for TBMs."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.pruefformulierung.pf_data_format import Pruefformulierung, PruefFormulierungsAgentOutput
from src.workflows.tbm_workflow.pruefformulierung.pf_prompt import (
    pruef_formulierungs_agent_prompt,
)

BATCH_SIZE = 50


@workflow.defn(name="PruefFormulierungsAgentWorkflow")
class PruefFormulierungsAgentWorkflow:
    """Agent for formulating test subjects and test questions."""

    @workflow.run
    async def run(self, a_tbs: list[str]) -> list[Pruefformulierung]:
        """Formulates test subjects and test questions based on atomic legal constituents."""

        a_tbms_mit_ids = [{"id": str(i), "tatbestandsmerkmal": tbm} for i, tbm in enumerate(a_tbs)]

        # Batch to avoid LLM gateway timeouts on large inputs
        batches = [a_tbms_mit_ids[i : i + BATCH_SIZE] for i in range(0, len(a_tbms_mit_ids), BATCH_SIZE)]

        async def _invoke_batch(batch: list[dict[str, str]]) -> list[Pruefformulierung]:
            """Invoke LLM for a batch of TBMs and return Prüfformulierungen."""
            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.LARGE_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": pruef_formulierungs_agent_prompt,
                    "input_dict": {
                        "atomare_tatbestandsmerkmale": batch,
                    },
                },
                output_class=PruefFormulierungsAgentOutput.with_expected_length(len(batch)),
            )

            return output.pruefungen

        batch_results = await workflow.asyncio.gather(*[_invoke_batch(batch) for batch in batches])

        return [p for results in batch_results for p in results]
