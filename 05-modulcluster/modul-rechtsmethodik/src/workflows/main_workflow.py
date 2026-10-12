"""Top-level orchestrator workflow for the Rechtsmethodik pipeline."""

import asyncio
from datetime import timedelta
from typing import Any

from temporal.contracts import (
    RechtsmethodikWorkflowInput,
    RechtsmethodikWorkflowOutput,
)
from temporal.registry import RECHTSMETHODIK_WORKFLOW
from temporalio import workflow

from src.activities.law_api_calls import FetchNormInput
from src.workflows.load_norm.load_norm import LoadNormWorkflow
from src.workflows.norm_workflow.norm_main_workflow import NormDekonstruktionWorkflow
from src.workflows.rf_workflow.rf_main_workflow import RechtsfolgenAnalyseWorkflow
from src.workflows.tbm_workflow.tbm_main_workflow import TatbestandsAnalyseWorkflow


@workflow.defn(name=RECHTSMETHODIK_WORKFLOW.name)
class RechtsmethodikWorkflow:
    @workflow.run
    async def run(self, input: RechtsmethodikWorkflowInput) -> RechtsmethodikWorkflowOutput:
        norm_data = await workflow.execute_child_workflow(
            LoadNormWorkflow.run,
            FetchNormInput(jurabk=input.jurabk, paragraph_nr=input.paragraph_nr),
            task_timeout=timedelta(seconds=60),
        )

        norm_output = await workflow.execute_child_workflow(NormDekonstruktionWorkflow.run, norm_data, task_timeout=timedelta(seconds=60))

        tbm_output, rf_output = await asyncio.gather(
            workflow.execute_child_workflow(
                TatbestandsAnalyseWorkflow.run,
                norm_output,
                task_timeout=timedelta(seconds=60),
            ),
            workflow.execute_child_workflow(
                RechtsfolgenAnalyseWorkflow.run,
                norm_output,
                task_timeout=timedelta(seconds=60),
            ),
        )
        # Dict-based merge required: TBM and RF workflows produce different Rechtsfolge schemas
        # that must be combined into the unified RechtsmethodikWorkflowOutput.Rechtsfolge
        tbm_dict = tbm_output.model_dump(exclude_none=True)
        rf_dict = rf_output.model_dump(exclude_none=True)
        merged_dict = self.merge_tbm_rf(tbm_dict, rf_dict)

        return RechtsmethodikWorkflowOutput.model_validate(merged_dict)

    @classmethod
    def merge_tbm_rf(cls, tbm_dict: dict[str, Any], rf_dict: dict[str, Any]) -> dict[str, Any]:
        """Merge rechtsfolge fields from rf_dict into tbm_dict for each Satz."""
        for abs_tbm, abs_rf in zip(tbm_dict["absaetze"], rf_dict["absaetze"], strict=True):
            for satz_tbm, satz_rf in zip(abs_tbm["saetze"], abs_rf["saetze"], strict=True):
                if "rechtsfolge" not in satz_tbm:
                    continue
                cls._merge_rechtsfolge(satz_tbm["rechtsfolge"], satz_rf["rechtsfolge"])

        return tbm_dict

    @staticmethod
    def _merge_rechtsfolge(tbm_rf: dict[str, Any], rf_rf: dict[str, Any]) -> None:
        """Copy keys from rf_rf into tbm_rf that are not already present."""
        for key, value in rf_rf.items():
            if key not in tbm_rf:
                tbm_rf[key] = value
