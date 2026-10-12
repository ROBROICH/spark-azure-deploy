"""Multi-agent workflow for structured norm deconstruction."""

import asyncio
from datetime import timedelta

from temporalio import workflow

from src.absatz import Absatz
from src.workflows.norm_workflow.atomarisierung.at import AtomarisierungsAgentWorkflow
from src.workflows.norm_workflow.norm_types import (
    AtomarisierungsAgentInput,
    NormDekonstruktionWorkflowInput,
    NormDekonstruktionWorkflowOutput,
    NormDekonstruktionWorkflowSatzInput,
    NormDekonstruktionWorkflowSatzOutput,
    RechtsfolgeKonstrukteurAgentInput,
)
from src.workflows.norm_workflow.normtyp.nt import NormTypAgentWorkflow
from src.workflows.norm_workflow.praedikatenlogik.pm import PraedikatenlogikModelliererAgentWorkflow
from src.workflows.norm_workflow.regelungsgegenstand.rgi import RegelungsgegenstandsIdentifikatorAgentWorkflow
from src.workflows.norm_workflow.rf_konstrukteur.rk import RechtsfolgeKonstrukteurAgentWorkflow
from src.workflows.norm_workflow.satz_kategorie.sk import SatzKategorieAgentWorkflow


@workflow.defn(name="NormDekonstruktionWorkflow")
class NormDekonstruktionWorkflow:
    """Multi-agent workflow for structured deconstruction of legal norms."""

    @workflow.run
    async def run(self, input: NormDekonstruktionWorkflowInput) -> NormDekonstruktionWorkflowOutput:
        """Execute the multi-agent norm deconstruction pipeline."""
        regelungsgegenstand = None
        absaetze: list[Absatz[NormDekonstruktionWorkflowSatzOutput]] = []

        if input.paragraph_text:
            regelungsgegenstand = await workflow.execute_child_workflow(
                RegelungsgegenstandsIdentifikatorAgentWorkflow.run,
                input,
                task_timeout=timedelta(seconds=60),
            )
            absaetze = [
                Absatz(
                    absatz_nr=absatz.absatz_nr,
                    absatz_text=absatz.absatz_text,
                    saetze=await asyncio.gather(*[self._process_satz(satz) for satz in absatz.saetze]),
                )
                for absatz in input.absaetze
            ]

        return NormDekonstruktionWorkflowOutput(
            gesetz=input.gesetz,
            jurabk=input.jurabk,
            standangaben=input.standangaben,
            paragraph_nr=input.paragraph_nr,
            paragraph_titel=input.paragraph_titel,
            paragraph_text=input.paragraph_text,
            absaetze=absaetze,
            regelungsgegenstand=regelungsgegenstand,
        )

    @classmethod
    async def _process_satz(cls, satz: NormDekonstruktionWorkflowSatzInput) -> NormDekonstruktionWorkflowSatzOutput:
        """Classify and deconstruct a single Satz through the agent pipeline."""
        norm_typ_lvl1 = await workflow.execute_child_workflow(
            NormTypAgentWorkflow.run, satz.satz_text, task_timeout=timedelta(seconds=60)
        )

        norm_typ_lvl2 = None
        tbms = None
        rechtsfolge = None
        atomare_tatbestandsmerkmale = None

        if norm_typ_lvl1 == "materiell-rechtlich":
            norm_typ_lvl2 = await workflow.execute_child_workflow(
                SatzKategorieAgentWorkflow.run, satz.satz_text, task_timeout=timedelta(seconds=60)
            )
            if norm_typ_lvl2 == "wenn-dann":
                (
                    tbms,
                    rechtsfolge,
                    atomare_tatbestandsmerkmale,
                    is_empty,
                ) = await cls._get_tbms_and_rf(satz.satz_text)
                if is_empty:
                    norm_typ_lvl2 = "sonstiges"

        return NormDekonstruktionWorkflowSatzOutput(
            satz_nr=satz.satz_nr,
            markers=satz.markers,
            satz_text=satz.satz_text,
            norm_typ_lvl1=norm_typ_lvl1,
            norm_typ_lvl2=norm_typ_lvl2,
            tatbestandsmerkmale=tbms or None,
            rechtsfolge=rechtsfolge,
            atomare_tatbestandsmerkmale=atomare_tatbestandsmerkmale,
        )

    @staticmethod
    async def _get_tbms_and_rf(satz_text: str) -> tuple[list[str] | None, str | None, list[str] | None, bool]:
        """Extract TBMs and Rechtsfolge, then atomize in parallel."""

        def _is_effectively_empty(val: list[str]) -> bool:
            """Check if a string list is empty or contains only whitespace."""
            return val == [] or all(s.strip() == "" for s in val)

        tbms, rechtsfolgen_raw = await workflow.execute_child_workflow(
            PraedikatenlogikModelliererAgentWorkflow.run,
            satz_text,
            task_timeout=timedelta(seconds=60),
        )

        if _is_effectively_empty(tbms) or _is_effectively_empty(rechtsfolgen_raw):
            return None, None, None, True

        atomare_tatbestandsmerkmale, rechtsfolge = await asyncio.gather(
            workflow.execute_child_workflow(
                AtomarisierungsAgentWorkflow.run,
                AtomarisierungsAgentInput(satz_text=satz_text, tatbestandsmerkmale=tbms),
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                RechtsfolgeKonstrukteurAgentWorkflow.run,
                RechtsfolgeKonstrukteurAgentInput(satz_text=satz_text, rechtsfolgen_raw=rechtsfolgen_raw),
                task_timeout=timedelta(seconds=60),
            ),
        )

        return tbms, rechtsfolge, atomare_tatbestandsmerkmale, False
