"""Top-level Temporal workflow for claim extraction and plausibility checking."""

from datetime import timedelta

from temporal.contracts import DMSFileResponse, PlausibilityOrchestratorInput
from temporal.registry import PLAUSIBILITAET_WORKFLOW
from temporalio import workflow

from src.config.config import config
from src.workflows.check_logic_wf.workflow import PlausibilityCheckOrchestratorWorkflow
from src.workflows.qdrant_wf.workflow import ClaimExtractionOrchestratorWorkflow


@workflow.defn(name=PLAUSIBILITAET_WORKFLOW.name)
class PlausibilityMainOrchestratorWorkflow:
    """Main orchestrator: claim extraction, then the plausibility check."""

    @workflow.run
    async def run(self, workflow_input: PlausibilityOrchestratorInput) -> DMSFileResponse:
        """Run the claim extraction workflow, then the check workflow."""
        await workflow.execute_child_workflow(
            ClaimExtractionOrchestratorWorkflow.run,
            arg=workflow_input,
            task_queue=workflow.info().task_queue,
            id=f"{workflow.info().workflow_id}-qdrant_builder",
            task_timeout=timedelta(seconds=config.TEMPORAL.WORKFLOW_TASK_TIMEOUT_SECONDS),
        )

        return await workflow.execute_child_workflow(
            PlausibilityCheckOrchestratorWorkflow.run,
            arg=workflow_input,
            task_queue=workflow.info().task_queue,
            id=f"{workflow.info().workflow_id}-check_logic",
            task_timeout=timedelta(seconds=config.TEMPORAL.WORKFLOW_TASK_TIMEOUT_SECONDS),
        )
