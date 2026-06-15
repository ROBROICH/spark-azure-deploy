"""Main Rechtsfolge analysis workflow."""

from datetime import timedelta

from temporal import sliding_window
from temporal.workflows.rechtsmethodik.types import WENN_DANN, Absatz, Rechtsfolge
from temporalio import workflow

from src.workflows.norm_workflow.norm_types import (
    NormDekonstruktionWorkflowOutput,
    NormDekonstruktionWorkflowSatzOutput,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.adressaten_ermessen_workflow import (
    AdressatenErmessenWorkflow,
)
from src.workflows.rf_workflow.rf_types import (
    RechtsfolgenWorkflowResult,
    RFWorkflowSatzOutput,
)
from src.workflows.rf_workflow.sollensanordnungen.sa import (
    SollensanordnungsAgentWorkflow,
)


def create_rf_satz(
    satz: NormDekonstruktionWorkflowSatzOutput,
    rf_output: Rechtsfolge | None,
) -> RFWorkflowSatzOutput:
    """Build an RFWorkflowSatzOutput by combining norm satz with its computed Rechtsfolge."""
    return RFWorkflowSatzOutput(
        satz_nr=satz.satz_nr,
        markers=satz.markers,
        satz_text=satz.satz_text,
        norm_typ_lvl_1=satz.norm_typ_lvl_1,
        norm_typ_lvl_2=satz.norm_typ_lvl_2,
        tatbestandsmerkmale=satz.tatbestandsmerkmale,
        rechtsfolge=rf_output,
        atomare_tatbestandsmerkmale=satz.atomare_tatbestandsmerkmale,
    )


def create_rf_absatz(
    absatz: Absatz[NormDekonstruktionWorkflowSatzOutput],
    rf_results: list[Rechtsfolge | None],
) -> Absatz[RFWorkflowSatzOutput]:
    """Build an Absatz of RFWorkflowSatzOutput from a norm absatz and its Rechtsfolge results."""
    rf_saetze = [create_rf_satz(satz, rf_output) for satz, rf_output in zip(absatz.saetze, rf_results, strict=True)]

    return Absatz[RFWorkflowSatzOutput](
        absatz_nr=absatz.absatz_nr,
        absatz_text=absatz.absatz_text,
        saetze=rf_saetze,
    )


@workflow.defn(name="RechtsfolgenAnalyseWorkflow")
class RechtsfolgenAnalyseWorkflow:
    """Workflow that analyses Rechtsfolgen for each Satz in a deconstructed norm."""

    @workflow.run
    async def run(
        self,
        norm_output: NormDekonstruktionWorkflowOutput,
    ) -> RechtsfolgenWorkflowResult:
        """Process all Sätze in parallel to identify Rechtsfolgen, adressaten, and Ermessen."""

        async def _process_satz(
            satz: NormDekonstruktionWorkflowSatzOutput,
        ) -> Rechtsfolge | None:
            """Run Rechtsfolge sub-agents for a single Satz."""
            if not (satz.norm_typ_lvl_2 == WENN_DANN and satz.rechtsfolge):
                return None

            ae_output, sa_output = await workflow.asyncio.gather(
                workflow.execute_child_workflow(
                    AdressatenErmessenWorkflow.run,
                    satz.rechtsfolge,
                    task_timeout=timedelta(seconds=60),
                ),
                workflow.execute_child_workflow(
                    SollensanordnungsAgentWorkflow.run,
                    satz.rechtsfolge,
                    task_timeout=timedelta(seconds=60),
                ),
            )

            return Rechtsfolge(
                text=satz.rechtsfolge,
                rechtsfolgen_adressat=ae_output.rechtsfolgen_adressat,
                ermessensspielraum=ae_output.ermessensspielraum,
                ermessensart=ae_output.ermessensart,
                sollensanordnungen=sa_output,
            )

        async def _process_absatz(
            idx_absatz: tuple[int, Absatz[NormDekonstruktionWorkflowSatzOutput]],
        ) -> tuple[int, Absatz[RFWorkflowSatzOutput]]:
            """Process all Sätze in an Absatz in parallel."""
            idx, absatz = idx_absatz

            async def _process_indexed(
                idx_satz: tuple[int, NormDekonstruktionWorkflowSatzOutput],
            ) -> tuple[int, Rechtsfolge | None]:
                """Process an indexed Absatz preserving order."""
                idx, satz = idx_satz
                return idx, await _process_satz(satz)

            indexed = await sliding_window(list(enumerate(absatz.saetze)), _process_indexed, concurrency=5)
            indexed.sort(key=lambda x: x[0])
            absatz_results = [r for _, r in indexed]

            return idx, create_rf_absatz(absatz, absatz_results)

        indexed_absaetze = await sliding_window(list(enumerate(norm_output.absaetze)), _process_absatz, concurrency=10)
        indexed_absaetze.sort(key=lambda x: x[0])
        rf_absaetze = [r for _, r in indexed_absaetze]

        return RechtsfolgenWorkflowResult(absaetze=rf_absaetze)
