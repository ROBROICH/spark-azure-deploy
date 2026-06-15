"""Agent for identifying explicit Verweise."""

from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve_data_format import (
    VerweisAgentOutputExplizit,
    VerweisBlockExplizit,
)
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve_prompt import (
    verweis_agent_prompt_explizit,
)
from src.workflows.tbm_workflow.verweis.verweis_types import VerweisAgentInputExplizit

BATCH_SIZE = 50


@workflow.defn(name="VerweisExplizitAgentWorkflow")
class VerweisExplizitAgentWorkflow:
    """Agent for extracting explicit references."""

    @workflow.run
    async def run(
        self,
        input: VerweisAgentInputExplizit,
    ) -> list[VerweisBlockExplizit]:
        """Extracts explicit references from the atomic legal constituents and the consequences."""

        a_tbms_mit_ids = [{"id": f"tbm_{i}", "tatbestandsmerkmal": tbm} for i, tbm in enumerate(input.atomare_tatbestandsmerkmale)]
        rf_mit_id = {"id": "rf_0", "rechtsfolge": input.rechtsfolge}

        # Batch a_tbms to avoid LLM gateway timeouts on large inputs
        # Ensure at least one batch exists so rechtsfolge is always processed
        batches = [a_tbms_mit_ids[i : i + BATCH_SIZE] for i in range(0, len(a_tbms_mit_ids), BATCH_SIZE)] or [[]]

        async def _invoke_batch(batch: list[dict[str, str]]) -> list[VerweisBlockExplizit]:
            """Invoke LLM to identify explicit Verweise in a batch of TBMs."""
            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.MEDIUM_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": verweis_agent_prompt_explizit,
                    "input_dict": {
                        "gesetz": input.gesetz,
                        "paragraph_nr": input.paragraph_nr,
                        "atomare_tatbestandsmerkmale": batch,
                        "rechtsfolge": rf_mit_id,
                    },
                },
                output_class=VerweisAgentOutputExplizit,
            )
            return output.verweise

        batch_results = await workflow.asyncio.gather(*[_invoke_batch(batch) for batch in batches])

        # Collect tbm_ entries from all batches, rf_ entries only from the first batch
        all_verweise = []
        for idx, results in enumerate(batch_results):
            for v in results:
                if idx == 0 or not v.id.startswith("rf_"):
                    all_verweise.append(v)

        return all_verweise
