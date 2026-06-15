import asyncio
from datetime import timedelta

from temporal.workflows.project_lifecycle.project_lifecycle import PROJECT_DELETION_WORKFLOW_ID
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.services.workflows.activities.delete_project import delete_project
from src.services.workflows.workflow_models import DeleteProjectInput

RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    maximum_interval=timedelta(minutes=1),
    maximum_attempts=1,
)


@workflow.defn(name=PROJECT_DELETION_WORKFLOW_ID)
class DeleteProjectWorkflow:
    @workflow.run
    async def run(self, workflow_input: DeleteProjectInput) -> None:
        workflow.logger.info(f"DeleteProjectWorkflow started for '{workflow_input.project_id}'")

        try:
            await workflow.execute_activity(
                delete_project,
                args=(workflow_input,),
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=RETRY_POLICY,
            )

            workflow.logger.info(f"DeleteProjectWorkflow completed for '{workflow_input.project_id}'")

        except asyncio.CancelledError:
            workflow.logger.exception(
                f"DeleteProjectWorkflow for project '{workflow_input.project_id}' has been canceled."
            )
            raise
        except Exception as e:
            workflow.logger.exception(f"DeleteProjectWorkflow for project '{workflow_input.project_id}' failed: {e}.")
            raise
