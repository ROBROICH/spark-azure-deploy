"""Workflow for enriching Auslegung context with Drucksachen and Urteile."""

import asyncio
import re
from datetime import timedelta

from temporal.contracts import (
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr import (
    DrucksachenKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.retrieval_types import (
    DrucksachenKontextRetrievalAgentInput,
    UrteileKontextRetrievalWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr import (
    UrteileKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_types import (
    AuslegungWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import format_legal_source


@workflow.defn(name="EnrichContextWorkflow")
class EnrichContextWorkflow:
    """Retrieves and enriches UnbestimmteRechtsbegriffe with UT and DKE context."""

    @workflow.run
    async def run(self, input: AuslegungWorkflowInput) -> list[UnbestimmterRechtsbegriffWithContext]:
        """Enrich Rechtsbegriffe with Drucksachen and Urteile context in parallel."""

        async def _enrich_single_begriff(
            ur: UnbestimmterRechtsbegriff,
            jurabk: str,
            paragraph_nr: str,
            absatz_nr: str,
            satz_text: str,
            normstelle: str,
            section_substrings: list[str],
        ) -> UnbestimmterRechtsbegriffWithContext:
            """Retrieves UT and DKE context for a single Rechtsbegriff in parallel."""

            u_chunks, d_chunks = await asyncio.gather(
                workflow.execute_child_workflow(
                    UrteileKontextRetrievalAgentWorkflow.run,
                    UrteileKontextRetrievalWorkflowInput(
                        begriff=ur.begriff,
                        name=jurabk,
                        name_suffix=None,
                        paragraph_nr=paragraph_nr,
                        absatz_nr=absatz_nr,
                    ),
                    task_timeout=timedelta(seconds=60),
                ),
                workflow.execute_child_workflow(
                    DrucksachenKontextRetrievalAgentWorkflow.run,
                    DrucksachenKontextRetrievalAgentInput(
                        jurabk=jurabk,
                        begriff=ur.begriff,
                        section_substrings=section_substrings,
                        normstelle=normstelle,
                        satz_text=satz_text,
                    ),
                    task_timeout=timedelta(seconds=60),
                ),
            )

            return UnbestimmterRechtsbegriffWithContext(
                **ur.model_dump(),
                u_context=u_chunks,
                d_context=[item.model_dump() for item in d_chunks],
            )

        normstelle = format_legal_source(
            jurabk=input.jurabk,
            paragraph_nr=input.paragraph_nr,
            absatz_nr=input.absatz_nr,
            satz_nr=input.satz_nr,
            markers=input.markers,
        )

        section_substrings = self._construct_substrings(
            paragraph_nr=input.paragraph_nr,
            absatz_nr=input.absatz_nr,
            satz_nr=input.satz_nr,
            markers=input.markers,
        )

        all_tasks = []

        for ur in input.urp_output:
            task = _enrich_single_begriff(
                ur=ur,
                jurabk=input.jurabk,
                paragraph_nr=input.paragraph_nr,
                absatz_nr=input.absatz_nr,
                satz_text=input.satz_text,
                normstelle=normstelle,
                section_substrings=section_substrings,
            )
            all_tasks.append(task)

        return await asyncio.gather(*all_tasks)

    @staticmethod
    def _construct_substrings(
        paragraph_nr: str,
        absatz_nr: str,
        satz_nr: str,
        markers: list[str],
    ) -> list[str]:
        """Build section substrings for Drucksachen similarity search."""
        substrings = [
            f"§ {paragraph_nr}",
            f"Abs. {absatz_nr}",
            f"Absatz {absatz_nr}",
            f"Satz {satz_nr}",
        ]

        for marker in markers:
            stripped_marker = marker.strip()
            if re.fullmatch(r"\d+(\.\d+)?", stripped_marker):
                substrings.extend([f"Nr. {stripped_marker}", f"Nummer {stripped_marker}"])
            elif re.fullmatch(r"[a-zA-Z]", stripped_marker):
                substrings.append(f"Buchstabe {stripped_marker}")
            elif re.fullmatch(r"[a-zA-Z]{2}", stripped_marker):
                substrings.append(f"Doppelbuchstabe {stripped_marker}")

        return substrings
