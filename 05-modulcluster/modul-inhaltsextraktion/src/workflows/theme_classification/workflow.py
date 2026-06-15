"""
Temporal workflow for classifying document theme based on a summary and a list of possible themes for the project.
"""

from pydantic import BaseModel
from temporalio import workflow

from src.activities.theme_classification import ThemeClassificationTaskOutput, theme_classification_task
from src.schemas import DocumentTopic

theme_classification_workflow_id = "theme-classification-workflow"


class ThemeClassificationWorkflowInput(BaseModel):
    theme_info: list[DocumentTopic] | None = None
    summary: str


class ThemeClassificationWorkflowOutput(BaseModel):
    topic: DocumentTopic | None = None
    reasoning: str


@workflow.defn(name=theme_classification_workflow_id)
class ThemeClassificationWorkflow:
    """Workflow for creating the pageindex structure for chunks."""

    @workflow.run
    async def run(self, input: ThemeClassificationWorkflowInput) -> ThemeClassificationWorkflowOutput:
        page_out: ThemeClassificationTaskOutput = await theme_classification_task(
            theme_info=input.theme_info, summary=input.summary
        )
        return ThemeClassificationWorkflowOutput(topic=page_out.topic, reasoning=page_out.reasoning)
