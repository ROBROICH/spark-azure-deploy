from src.workflows.argument_classification_batch_workflow import ArgumentClassificationSingleBatchWorkflow
from src.workflows.argument_classification_workflow import ArgumentClassificationWorkflow
from src.workflows.argument_extraction_batch_workflow import ArgumentExtractionSingleBatchWorkflow
from src.workflows.argument_extraction_workflow import ArgumentExtractionWorkflow

workflows = [
    ArgumentExtractionWorkflow,
    ArgumentExtractionSingleBatchWorkflow,
    ArgumentClassificationWorkflow,
    ArgumentClassificationSingleBatchWorkflow,
]
