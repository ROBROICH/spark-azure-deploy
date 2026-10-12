"""Orchestrator for interpreting unbestimmte Rechtsbegriffe via canons of interpretation."""

import asyncio
from datetime import timedelta

from temporal.contracts import (
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    HistorieAuslegerAgentInput,
    SystematikAuslegerAgentInput,
    TelosAuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
    UrteilKlassifikationInput,
    UTChunk,
    WortlautAuslegungWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef import (
    ErgebnisFormuliererAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha import (
    HistorieAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.enrich_context_workflow import (
    EnrichContextWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.systematik.sa import (
    SystematikAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.telos.ta import (
    TelosAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk import (
    UrteilKlassifikationAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk_data_format import (
    AuslegungsMethode,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow import (
    WortlautAuslegungWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_types import (
    AuslegungWorkflowInput,
)


@workflow.defn(name="AuslegungWorkflow")
class AuslegungWorkflow:
    """Conducts the interpretation of unspecified legal terms."""

    @workflow.run
    async def run(self, input: AuslegungWorkflowInput) -> list[UnbestimmterRechtsbegriff]:
        """Run all canons of interpretation for each unbestimmter Rechtsbegriff."""
        enriched_urp: list[UnbestimmterRechtsbegriffWithContext] = await workflow.execute_child_workflow(
            EnrichContextWorkflow.run,
            input,
            task_timeout=timedelta(seconds=60),
        )

        classifications: list[dict[AuslegungsMethode, list[UTChunk]]] = await workflow.execute_child_workflow(
            UrteilKlassifikationAgentWorkflow.run,
            UrteilKlassifikationInput(
                jurabk=input.jurabk,
                paragraph_nr=input.paragraph_nr,
                absatz_nr=input.absatz_nr,
                satz_nr=input.satz_nr,
                markers=input.markers,
                satz_text=input.satz_text,
                enriched_urp=enriched_urp,
            ),
            task_timeout=timedelta(seconds=60),
        )

        wa_urp, sa_urp, ha_urp, ta_urp = self._build_method_specific_urp(enriched_urp, classifications)

        (wa_output, sa_output, ha_output, ta_output) = await asyncio.gather(
            workflow.execute_child_workflow(
                WortlautAuslegungWorkflow.run,
                WortlautAuslegungWorkflowInput(
                    satz_text=input.satz_text,
                    paragraph_text=input.paragraph_text,
                    enriched_urp=wa_urp,
                ),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                SystematikAuslegerAgentWorkflow.run,
                SystematikAuslegerAgentInput(
                    jurabk=input.jurabk,
                    paragraph_nr=input.paragraph_nr,
                    absatz_nr=input.absatz_nr,
                    satz_nr=input.satz_nr,
                    markers=input.markers,
                    satz_text=input.satz_text,
                    enriched_urp=sa_urp,
                ),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                HistorieAuslegerAgentWorkflow.run,
                HistorieAuslegerAgentInput(
                    jurabk=input.jurabk,
                    paragraph_nr=input.paragraph_nr,
                    absatz_nr=input.absatz_nr,
                    satz_nr=input.satz_nr,
                    markers=input.markers,
                    satz_text=input.satz_text,
                    enriched_urp=ha_urp,
                ),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                TelosAuslegerAgentWorkflow.run,
                TelosAuslegerAgentInput(
                    jurabk=input.jurabk,
                    paragraph_nr=input.paragraph_nr,
                    absatz_nr=input.absatz_nr,
                    satz_nr=input.satz_nr,
                    markers=input.markers,
                    satz_text=input.satz_text,
                    enriched_urp=ta_urp,
                ),
                task_timeout=timedelta(seconds=60),
            ),
        )

        merged_ur = self._merge_auslegungen(wa_output, sa_output, ha_output, ta_output)

        ef_output = await workflow.execute_child_workflow(
            ErgebnisFormuliererAgentWorkflow.run,
            merged_ur,
            task_timeout=timedelta(seconds=60),
        )

        return self._prepend_wortlaut_attribution(ef_output)

    @staticmethod
    def _prepend_wortlaut_attribution(
        results: list[UnbestimmterRechtsbegriff],
    ) -> list[UnbestimmterRechtsbegriff]:
        """Prefix each Wortlaut result with its source word."""
        attribution = (
            "Zur Analyse von Wortbedeutungen greift SPARK Workflow über die Wikimedia-API auf Wiktionary zu. Die darüber bereitgestellten Inhalte stehen unter folgender Lizenz: CC-BY-SA 3.0.\n\n"
        )
        for ur in results:
            for av in ur.auslegungsvorschläge:
                if av.auslegung_methode == "wortlaut":
                    av.auslegungsvorschlag = attribution + av.auslegungsvorschlag
        return results

    @staticmethod
    def _build_method_specific_urp(
        enriched_urp: list[UnbestimmterRechtsbegriffWithContext],
        classifications: list[dict[AuslegungsMethode, list[UTChunk]]],
    ) -> tuple[
        list[UnbestimmterRechtsbegriffWithContext],
        list[UnbestimmterRechtsbegriffWithContext],
        list[UnbestimmterRechtsbegriffWithContext],
        list[UnbestimmterRechtsbegriffWithContext],
    ]:
        """Build per-method enriched_urp lists with filtered u_context based on classification."""
        method_order: list[AuslegungsMethode] = ["wortlaut", "systematik", "historie", "telos"]
        result: list[list[UnbestimmterRechtsbegriffWithContext]] = [[] for _ in method_order]

        for ur, class_map in zip(enriched_urp, classifications, strict=True):
            for i, methode in enumerate(method_order):
                filtered = UnbestimmterRechtsbegriffWithContext(
                    begriff=ur.begriff,
                    auslegungsvorschläge=ur.auslegungsvorschläge,
                    u_context=class_map.get(methode, []),
                    d_context=ur.d_context,
                )
                result[i].append(filtered)

        return result[0], result[1], result[2], result[3]

    @staticmethod
    def _merge_auslegungen(
        wa_output: list[UnbestimmterRechtsbegriff],
        sa_output: list[UnbestimmterRechtsbegriff],
        ha_output: list[UnbestimmterRechtsbegriff],
        ta_output: list[UnbestimmterRechtsbegriff],
    ) -> list[UnbestimmterRechtsbegriff]:
        """Merge partial Auslegung results into the final output."""
        return [
            UnbestimmterRechtsbegriff(
                begriff=wa.begriff,
                auslegungsvorschläge=(
                    wa.auslegungsvorschläge
                    + sa.auslegungsvorschläge
                    + ha.auslegungsvorschläge
                    + ta.auslegungsvorschläge
                ),
            )
            for wa, sa, ha, ta in zip(wa_output, sa_output, ha_output, ta_output, strict=True)
        ]
