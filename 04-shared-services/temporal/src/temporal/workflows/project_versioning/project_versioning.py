from temporal.utils import WorkflowName, execute_workflow
from temporal.workflows.project_versioning.types import (
    CreateProjectVersionInput,
    CreateProjectVersionOutput,
)

TASK_QUEUE = "project_logic_service"
CREATE_PROJECT_VERSION_WORKFLOW_ID = WorkflowName("CreateProjectVersionWorkflow")


async def execute_create_project_version_workflow(
    input: CreateProjectVersionInput,
    *,
    project_id: str | None = None,
    task_queue: str = TASK_QUEUE,
) -> CreateProjectVersionOutput:
    result = await execute_workflow(
        workflow_id=CREATE_PROJECT_VERSION_WORKFLOW_ID,
        input=input,
        task_queue=task_queue,
        project_id=project_id,
    )
    return CreateProjectVersionOutput.model_validate(result)
