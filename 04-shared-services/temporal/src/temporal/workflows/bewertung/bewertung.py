"""Workflow-Starter und Hilfsfunktionen für den Bewertungs-Workflow."""

from temporal.workflows.bewertung.types import (
    BewertungsWorkflowInput,
    BewertungsWorkflowOutput,
)
from temporalio.client import Client, WorkflowHandle
from ulid import ULID

bewertungs_workflow_id = "bewertungs_workflow"
TASK_QUEUE = "bewertung"


async def execute_bewertungs_workflow(
    client: Client,
    input: BewertungsWorkflowInput,
) -> BewertungsWorkflowOutput:
    """Starte den Bewertungs-Workflow und warte auf das Ergebnis."""
    return await client.execute_workflow(
        bewertungs_workflow_id,
        input,
        id=str(ULID()),
        task_queue=TASK_QUEUE,
    )


async def start_bewertungs_workflow(
    client: Client,
    input: BewertungsWorkflowInput,
) -> WorkflowHandle[Client, BewertungsWorkflowOutput]:
    """Starte den Bewertungs-Workflow und gib den Handle zurück."""
    return await client.start_workflow(
        bewertungs_workflow_id,
        input,
        id=str(ULID()),
        task_queue=TASK_QUEUE,
    )
