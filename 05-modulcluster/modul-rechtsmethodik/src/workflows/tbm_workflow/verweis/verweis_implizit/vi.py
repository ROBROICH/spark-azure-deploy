"""Agent for identifying implicit Verweise."""

from rapidfuzz import fuzz
from temporalio import workflow

from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.verweis.utils import filter_vi_output
from src.workflows.tbm_workflow.verweis.verweis_implizit.vi_data_format import (
    VerweisAgentOutputImplizit,
)
from src.workflows.tbm_workflow.verweis.verweis_implizit.vi_prompt import (
    verweis_agent_prompt_implizit,
)
from src.workflows.tbm_workflow.verweis.verweis_types import VerweisAgentInputImplizit


@workflow.defn(name="VerweisImplizitAgentWorkflow")
class VerweisImplizitAgentWorkflow:
    """Agent for extracting implicit references."""

    @workflow.run
    async def run(self, input: VerweisAgentInputImplizit) -> tuple[list[list[str]], list[str]]:
        """Extracts implicit references from the given legal sentence."""
        output = await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": verweis_agent_prompt_implizit,
                "input_dict": {
                    "satz_text": input.satz_text,
                },
            },
            output_class=VerweisAgentOutputImplizit,
        )

        filtered_output = filter_vi_output(output.verweise)

        return self._assign_verweise_to_tbms_and_rf(
            a_tbms=input.atomare_tatbestandsmerkmale,
            rf=input.rechtsfolge,
            verweise=filtered_output,
            threshold=85.0,
        )

    @staticmethod
    def _assign_verweise_to_tbms_and_rf(
        a_tbms: list[str],
        rf: str,
        verweise: list[str],
        threshold: float,
    ) -> tuple[list[list[str]], list[str]]:
        """Distribute detected implicit Verweise to their matching TBMs and RF."""
        vi_a_tbms_output = [[] for _ in range(len(a_tbms))]
        vi_rf_output = []

        a_tbms_lower = [a_tbm.lower() for a_tbm in a_tbms]
        rf_lower = rf.lower()

        for verweis in verweise:
            for i, a_tbm_lower in enumerate(a_tbms_lower):
                score_a_tbm = fuzz.partial_ratio(verweis.lower(), a_tbm_lower)
                if score_a_tbm >= threshold:
                    vi_a_tbms_output[i].append(verweis)

            score_rf = fuzz.partial_ratio(verweis.lower(), rf_lower)
            if score_rf >= threshold:
                vi_rf_output.append(verweis)

        return vi_a_tbms_output, vi_rf_output
