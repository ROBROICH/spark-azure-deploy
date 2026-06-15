from temporal.utils import WorkflowName, execute_workflow
from temporal.workflows.begruendungen.types import ProcessLawDocInput, ProcessLawDocResult
from temporal.workflows.begruendungen.update_begruendungen import TASK_QUEUE

UPDATE_BEGRUENDUNGEN_LAW_DOC_WORKFLOW_ID = WorkflowName("UpdateBegruendungenLawDocWorkflow")


async def execute_update_begruendungen_law_doc_workflow(
    input: ProcessLawDocInput,
    project_id: str | None = None,
) -> ProcessLawDocResult:
    result = await execute_workflow(
        workflow_id=UPDATE_BEGRUENDUNGEN_LAW_DOC_WORKFLOW_ID,
        input=input,
        task_queue=TASK_QUEUE,
        project_id=project_id,
    )
    return ProcessLawDocResult(**result) if isinstance(result, dict) else result
