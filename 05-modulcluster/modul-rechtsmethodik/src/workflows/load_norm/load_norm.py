"""Workflow for loading norm data from the law database."""

from temporalio import workflow

from src.activities.law_api_calls import FetchNormInput, fetch_all_norm_data
from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowInput


@workflow.defn(name="LoadNormWorkflow")
class LoadNormWorkflow:
    @workflow.run
    async def run(self, input: FetchNormInput) -> NormDekonstruktionWorkflowInput:
        return await fetch_all_norm_data(input)
