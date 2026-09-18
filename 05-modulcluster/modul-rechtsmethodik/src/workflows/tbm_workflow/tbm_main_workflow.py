"""Main TBM analysis workflow running parallel sub-agents."""

import asyncio
from collections.abc import Awaitable
from datetime import timedelta
from typing import Any

from temporal import sliding_window
from temporal.workflows.rechtsmethodik.types import (
    WENN_DANN,
    Absatz,
    AtomaresTBM,
    Rechtsbegriffe,
    Verweise,
)
from temporalio import workflow

from src.workflows.norm_workflow.norm_types import (
    NormDekonstruktionWorkflowOutput,
    NormDekonstruktionWorkflowSatzOutput,
)
from src.workflows.tbm_workflow.formelextraktion.fe import FormelExtrahiererAgentWorkflow
from src.workflows.tbm_workflow.pruefformulierung.pf import PruefFormulierungsAgentWorkflow
from src.workflows.tbm_workflow.pruefformulierung.pf_data_format import Pruefformulierung
from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_workflow import RechtsbegriffeWorkflow
from src.workflows.tbm_workflow.tbm_types import (
    FormelextrahiererAgentInput,
    RechtsbegriffeWorkflowInput,
    TBMWorkflowOutput,
    TBMWorkflowRechtsfolge,
    TBMWorkflowSatzOutput,
    VerweisWorkflowInput,
)
from src.workflows.tbm_workflow.verweis.verweis_workflow import VerweisWorkflow


async def _noop_list() -> list[Any]:
    return []


async def _noop_none() -> None:
    return None


@workflow.defn(name="TatbestandsAnalyseWorkflow")
class TatbestandsAnalyseWorkflow:
    """Performs a parallel analysis of legal norms at the TBM level."""

    @workflow.run
    async def run(self, input: NormDekonstruktionWorkflowOutput) -> TBMWorkflowOutput:
        """Process all Absätze in parallel, dispatching sub-agents per Satz."""

        async def _process_absatz(
            idx_absatz: tuple[int, Absatz[NormDekonstruktionWorkflowSatzOutput]],
        ) -> tuple[int, Absatz[TBMWorkflowSatzOutput]]:
            """Process all Sätze in an Absatz with sliding window concurrency."""
            idx, absatz = idx_absatz

            async def _process_satz(
                idx_satz: tuple[int, NormDekonstruktionWorkflowSatzOutput],
            ) -> tuple[int, TBMWorkflowSatzOutput]:
                """Dispatch a single Satz to the class-level processor."""
                idx, satz = idx_satz
                return idx, await self._process_satz(
                    gesetz=input.gesetz,
                    jurabk=input.jurabk,
                    paragraph_nr=input.paragraph_nr,
                    paragraph_text=input.paragraph_text,
                    absatz_nr=absatz.absatz_nr,
                    satz=satz,
                )

            indexed = await sliding_window(list(enumerate(absatz.saetze)), _process_satz, concurrency=5)
            indexed.sort(key=lambda x: x[0])
            saetze = [r for _, r in indexed]

            return idx, Absatz(absatz_nr=absatz.absatz_nr, absatz_text=absatz.absatz_text, saetze=saetze)

        indexed_absaetze = await sliding_window(list(enumerate(input.absaetze)), _process_absatz, concurrency=10)
        indexed_absaetze.sort(key=lambda x: x[0])
        tbm_absaetze = [r for _, r in indexed_absaetze]

        return TBMWorkflowOutput(
            gesetz=input.gesetz,
            jurabk=input.jurabk,
            standangaben=input.standangaben,
            paragraph_nr=input.paragraph_nr,
            paragraph_titel=input.paragraph_titel,
            paragraph_text=input.paragraph_text,
            absaetze=tbm_absaetze,
            regelungsgegenstand=input.regelungsgegenstand,
        )

    @classmethod
    async def _process_satz(
        cls,
        gesetz: str,
        jurabk: str,
        paragraph_nr: str,
        paragraph_text: str,
        absatz_nr: str,
        satz: NormDekonstruktionWorkflowSatzOutput,
    ) -> TBMWorkflowSatzOutput:
        """Dispatch child workflows for a single Satz and assemble the output."""
        base_output = TBMWorkflowSatzOutput(
            satz_nr=satz.satz_nr,
            markers=satz.markers,
            satz_text=satz.satz_text,
            norm_typ_lvl_1=satz.norm_typ_lvl_1,
            norm_typ_lvl_2=satz.norm_typ_lvl_2,
        )

        if satz.norm_typ_lvl_2 != WENN_DANN:
            return base_output

        if not satz.atomare_tatbestandsmerkmale and not satz.rechtsfolge:
            return base_output

        final_a_tbms, final_rf, fe_output = await cls._run_child_workflows(
            satz, gesetz, jurabk, paragraph_nr, paragraph_text, absatz_nr
        )

        return TBMWorkflowSatzOutput(
            satz_nr=satz.satz_nr,
            markers=satz.markers,
            satz_text=satz.satz_text,
            norm_typ_lvl_1=satz.norm_typ_lvl_1,
            norm_typ_lvl_2=satz.norm_typ_lvl_2,
            tatbestandsmerkmale=satz.tatbestandsmerkmale,
            atomare_tatbestandsmerkmale=final_a_tbms,
            rechtsfolge=final_rf,
            formel=fe_output,
        )

    @classmethod
    async def _run_child_workflows(
        cls,
        satz: NormDekonstruktionWorkflowSatzOutput,
        gesetz: str,
        jurabk: str,
        paragraph_nr: str,
        paragraph_text: str,
        absatz_nr: str,
    ) -> tuple[list[AtomaresTBM] | None, TBMWorkflowRechtsfolge | None, str | None]:
        """Launch and await all relevant child workflows for a Satz, return assembled TBMs and RF."""
        pf_task, verweis_task, rechtsbegriffe_task, fe_task = cls._build_workflow_tasks(
            satz, gesetz, jurabk, paragraph_nr, paragraph_text, absatz_nr
        )
        results = await asyncio.gather(pf_task, verweis_task, rechtsbegriffe_task, fe_task)
        return cls._assemble_satz_results(results, satz)

    @staticmethod
    def _build_workflow_tasks(
        satz: NormDekonstruktionWorkflowSatzOutput,
        gesetz: str,
        jurabk: str,
        paragraph_nr: str,
        paragraph_text: str,
        absatz_nr: str,
    ) -> tuple[Any, Any, Any, Any]:
        """Create child workflow coroutines for all parallel tasks."""
        verweis_task = workflow.execute_child_workflow(
            VerweisWorkflow.run,
            VerweisWorkflowInput(
                gesetz=gesetz,
                paragraph_nr=paragraph_nr,
                absatz_nr=absatz_nr,
                satz_nr=satz.satz_nr,
                satz_text=satz.satz_text,
                atomare_tatbestandsmerkmale=satz.atomare_tatbestandsmerkmale or [],
                rechtsfolge=satz.rechtsfolge or "",
            ),
            task_timeout=timedelta(seconds=60),
        )
        pf_task: Awaitable[Any] = (
            workflow.execute_child_workflow(
                PruefFormulierungsAgentWorkflow.run,
                satz.atomare_tatbestandsmerkmale,
                task_timeout=timedelta(seconds=60),
            )
            if satz.atomare_tatbestandsmerkmale
            else _noop_list()
        )
        rechtsbegriffe_task: Awaitable[Any] = (
            workflow.execute_child_workflow(
                RechtsbegriffeWorkflow.run,
                RechtsbegriffeWorkflowInput(
                    gesetz=gesetz,
                    jurabk=jurabk,
                    absatz_nr=absatz_nr,
                    paragraph_nr=paragraph_nr,
                    satz_nr=satz.satz_nr,
                    markers=satz.markers,
                    paragraph_text=paragraph_text,
                    satz_text=satz.satz_text,
                    atomare_tatbestandsmerkmale=satz.atomare_tatbestandsmerkmale,
                ),
                task_timeout=timedelta(seconds=60),
            )
            if satz.atomare_tatbestandsmerkmale
            else _noop_list()
        )
        fe_task: Awaitable[Any] = (
            workflow.execute_child_workflow(
                FormelExtrahiererAgentWorkflow.run,
                FormelextrahiererAgentInput(
                    satz_text=satz.satz_text,
                    atomare_tatbestandsmerkmale=satz.atomare_tatbestandsmerkmale,
                    rechtsfolge=satz.rechtsfolge,
                ),
                task_timeout=timedelta(seconds=60),
            )
            if (satz.atomare_tatbestandsmerkmale and satz.rechtsfolge)
            else _noop_none()
        )
        return pf_task, verweis_task, rechtsbegriffe_task, fe_task

    @staticmethod
    def _assemble_satz_results(
        results: tuple[Any, ...] | list[Any],
        satz: NormDekonstruktionWorkflowSatzOutput,
    ) -> tuple[list[AtomaresTBM] | None, TBMWorkflowRechtsfolge | None, str | None]:
        """Unpack gathered results and assemble the final TBMs and Rechtsfolge."""
        pf_output = results[0]
        verweis_output_tbms, verweis_output_rf = results[1]
        rechtsbegriffe_output = results[2]
        fe_output = results[3]

        final_a_tbms = (
            _assemble_atomare_tbms(
                satz.atomare_tatbestandsmerkmale, verweis_output_tbms, pf_output, rechtsbegriffe_output
            )
            if satz.atomare_tatbestandsmerkmale
            else None
        )
        final_rf = (
            TBMWorkflowRechtsfolge(text=satz.rechtsfolge, verweise=verweis_output_rf) if satz.rechtsfolge else None
        )

        return final_a_tbms, final_rf, fe_output


def _assemble_atomare_tbms(
    atomare_tatbestandsmerkmale: list[str],
    verweis_output_tbms: list[Verweise],
    pf_output: list[Pruefformulierung],
    rechtsbegriffe_output: list[Rechtsbegriffe],
) -> list[AtomaresTBM]:
    """Combine per-TBM results into AtomaresTBM objects."""
    return [
        AtomaresTBM(
            text=a_tbm,
            verweise=verweis_output_tbms[ind],
            prueffrage=pf_output[ind].prueffrage,
            pruefgegenstand=pf_output[ind].pruefgegenstand,
            rechtsbegriffe=rechtsbegriffe_output[ind],
        )
        for ind, a_tbm in enumerate(atomare_tatbestandsmerkmale)
    ]
