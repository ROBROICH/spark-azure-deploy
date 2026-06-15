"""
Temporal workflow for adding pageindex structure.

This workflow for a single file:

1. Loads the markdown content of a single markdown file.
2. Creates its summarized structure.
3. Saves its summarized structure to DMS with the _structure.json path.

The workflow for multiple files simply call the first one for all _processed.json
files it receives as input.
"""

from pydantic import BaseModel
from temporalio import workflow

from src.activities.pageindex import MyPageIndexTaskOutput, pageindex_task
from src.schemas import Chunk

page_structure_workflow_id = "page-structure-workflow"


class MyPageIndexWorkflowInput(BaseModel):
    """Input for the page structure workflow."""

    chunks: list[Chunk]


class MyPageIndexWorkflowOutput(BaseModel):
    """Output of the page structure workflow with summarized chunks."""

    chunks: list[Chunk]


@workflow.defn(name=page_structure_workflow_id)
class PageStructureWorkflow:
    """Workflow for creating the pageindex structure for chunks."""

    @workflow.run
    async def run(self, input: MyPageIndexWorkflowInput) -> MyPageIndexWorkflowOutput:
        """Run the pageindex summarization activity and return enriched chunks."""
        page_out: MyPageIndexTaskOutput = await pageindex_task(chunks=input.chunks)
        return MyPageIndexWorkflowOutput(chunks=page_out.chunks)
