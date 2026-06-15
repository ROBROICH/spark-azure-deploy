from src.workflows.inhaltsverzeichnis_finder import (
    InhaltsverzeichnisFinderWorkflow,
)
from src.workflows.inhaltsverzeichnis_matching import (
    InhaltsverzeichnisMatchingWorkflow,
)
from src.workflows.llm_matching import LLMMatchingWorkflow
from src.workflows.llm_matching_single_document import LLMMatchingSingleDocumentWorkflow

workflows = [
    LLMMatchingWorkflow,
    LLMMatchingSingleDocumentWorkflow,
    InhaltsverzeichnisFinderWorkflow,
    InhaltsverzeichnisMatchingWorkflow,
]
