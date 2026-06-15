"""Workflow starter functions for the Risikohinweis child workflow.

Provides execute_* and start_* functions for running RiskCheckerWorkflow
from other workflows or external callers.
"""

from temporalio import workflow
from temporalio.client import Client, WorkflowHandle

from temporal.workflows.risikohinweis.types import PFBChapter, RiskFinderOutput

RISIKOHINWEISER_WORKFLOW_NAME = "RiskCheckerWorkflow"
TASK_QUEUE = "risikohinweiser"


async def execute_risikohinweis_child_workflow(
    chapter: PFBChapter,
    project_id: str | None = None,
) -> RiskFinderOutput:
    return await workflow.execute_child_workflow(
        RISIKOHINWEISER_WORKFLOW_NAME,
        chapter,
        task_queue=TASK_QUEUE,
        result_type=RiskFinderOutput,
    )


async def execute_risikohinweis_workflow(
    client: Client,
    chapter: PFBChapter,
) -> RiskFinderOutput:
    """Execute the Risikohinweis child workflow and wait for the result.

    Args:
        client: Temporal client.
        chapter: Chapter to analyze for risks.

    Returns:
        RiskFinderOutput containing identified risks.
    """
    return await client.execute_workflow(
        RISIKOHINWEISER_WORKFLOW_NAME,
        chapter,
        id=f"risikohinweis-{chapter.id}",
        task_queue=TASK_QUEUE,
    )


async def start_risikohinweis_workflow(
    client: Client,
    chapter: PFBChapter,
) -> WorkflowHandle[Client, RiskFinderOutput]:
    """Start the Risikohinweis child workflow and return the handle.

    Args:
        client: Temporal client.
        chapter: Chapter to analyze for risks.

    Returns:
        Workflow handle for the started workflow.
    """
    return await client.start_workflow(
        RISIKOHINWEISER_WORKFLOW_NAME,
        chapter,
        id=f"risikohinweis-{chapter.id}",
        task_queue=TASK_QUEUE,
    )
