"""Top-level Temporal workflow for claim extraction and plausibility checking."""

from datetime import timedelta

from temporalio import workflow

from src.dms.schemas import DMSFileResponse
from src.workflows.check_logic_wf.workflow import PlausibilityCheckOrchestratorWorkflow
from src.workflows.input_schemas import OrchestratorInputSchema
from src.workflows.qdrant_wf.workflow import ClaimExtractionOrchestratorWorkflow


@workflow.defn
class PlausibilityMainOrchestratorWorkflow:
    """Main orchestrator workflow that can start different sub-workflows based on input."""

    @workflow.run
    async def run(self, workflow_input: OrchestratorInputSchema) -> DMSFileResponse:
        """First runs the qdrant builder workflow, then the check logic workflow."""
        await workflow.execute_child_workflow(
            ClaimExtractionOrchestratorWorkflow.run,
            arg=workflow_input,
            task_queue=workflow.info().task_queue,
            id=f"{workflow.info().workflow_id}-qdrant_builder",
            task_timeout=timedelta(seconds=60),
        )

        check_logic_result = await workflow.execute_child_workflow(
            PlausibilityCheckOrchestratorWorkflow.run,
            arg=workflow_input,
            task_queue=workflow.info().task_queue,
            id=f"{workflow.info().workflow_id}-check_logic",
            task_timeout=timedelta(seconds=60),
        )

        return check_logic_result
