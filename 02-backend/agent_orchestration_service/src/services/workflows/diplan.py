from typing import Any

from temporal.utils import WorkflowName, execute_workflow, start_workflow
from temporal.workflows.inhaltsextraktion.types import DocumentTopic
from temporalio import workflow
from temporalio.client import WorkflowHandle
from temporalio.common import WorkflowIDReusePolicy
from temporalio.workflow import ChildWorkflowHandle

from src.config.settings import settings
from src.models.schemas.files import FileObject
from src.models.schemas.temporal.diplan import DiPlanWorkflowArgs
from src.models.schemas.temporal.fvp import FullFVPWorkflowInput
from src.services.activities.fvp import get_topics
from src.services.activities.results import (
    send_fvp_results,
    send_plausibility_results,
)
from src.services.workflows.diplan_download import execute_diplan_download
from src.services.workflows.fvp_workflow import run_fvp_workflow
from src.services.workflows.workflow_constants import (
    DEFAULT_RETRY_POLICY,
    DEFAULT_START_TO_CLOSE_TIMEOUT,
    FORMAL_COMPLETENESS,
    PLAUSIBILITY_CHECK,
)

DI_PLAN_WORKFLOW_ID = WorkflowName("DiPlanWorkflow")
TASK_QUEUE = settings.temporal.task_queue


@workflow.defn(name=DI_PLAN_WORKFLOW_ID)
class DiPlanWorkflow:
    @workflow.run
    async def run(self, args: DiPlanWorkflowArgs) -> dict[str, Any]:
        file_objects = await execute_diplan_download(args.project_id, args.files)
        file_ids = [str(file.id) for file in file_objects]
        project_topics = await workflow.execute_activity(
            get_topics,
            args.project_id,
            start_to_close_timeout=DEFAULT_START_TO_CLOSE_TIMEOUT,
            retry_policy=DEFAULT_RETRY_POLICY,
        )

        results = await run_fvp_workflow(
            FullFVPWorkflowInput(
                project_id=args.project_id,
                file_ids=file_ids,
                topics=[DocumentTopic(**topic.model_dump(mode="json")) for topic in project_topics],
                document_types=args.folder_information,
                diplan_preprocessing=True,
            )
        )

        for result in results.results:
            if result.error or result.result is None:
                continue

            file_object = FileObject(**result.result)
            if result.workflow_type == FORMAL_COMPLETENESS:
                await send_fvp_results(
                    project_id=str(file_object.project_id),
                    file_id=str(file_object.id),
                )
            elif result.workflow_type == PLAUSIBILITY_CHECK:
                await send_plausibility_results(
                    project_id=str(file_object.project_id),
                    file_id=str(file_object.id),
                )

        return {
            "downloaded_files": file_objects,
            "workflow_results": [result.model_dump(mode="json") for result in results.results],
        }


async def execute_diplan_workflow(input: DiPlanWorkflowArgs, project_id: str | None = None) -> dict[str, Any]:
    return await execute_workflow(
        workflow_id=DI_PLAN_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )


async def start_diplan_workflow(
    input: DiPlanWorkflowArgs, project_id: str | None = None
) -> WorkflowHandle[Any, dict[str, Any]] | ChildWorkflowHandle[Any, dict[str, Any]]:
    return await start_workflow(
        workflow_id=DI_PLAN_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )
