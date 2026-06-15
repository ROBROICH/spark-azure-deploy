"""Child workflow wrapping the VLM batch processing pipeline."""

from temporalio import workflow

from src.workflows.helpers.vlm_batch_processor import process_vlm_batches
from src.workflows.vlm_enhancement.output_format import (
    VLMProcessingWorkflowInput,
    VLMProcessingWorkflowOutput,
)

vlm_batch_processing_workflow_id = "vlm-batch-processing"


@workflow.defn(name=vlm_batch_processing_workflow_id)
class VLMProcessingWorkflow:
    """Batch VLM processing orchestration workflow."""

    @workflow.run
    async def run(self, input: VLMProcessingWorkflowInput) -> VLMProcessingWorkflowOutput:
        """Orchestrate two-phase VLM processing for visual elements."""
        results = await process_vlm_batches(vlm_inputs=input.vlm_inputs)
        return VLMProcessingWorkflowOutput(vlm_results=results)
