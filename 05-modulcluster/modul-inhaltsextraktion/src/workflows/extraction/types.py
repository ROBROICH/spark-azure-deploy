"""Data schemas for the Hybrid Extraction Workflow.

These schemas define the input and output structures for the hybrid extraction
orchestrator, which intelligently decides whether to perform pure OCR
(Light ON OCR) or Docling extraction based on the scan status of individual
PDF pages, seamlessly supporting both methods in a single document.
"""

from uuid import UUID

from pydantic import BaseModel

from src.activities.dms_activities import DmsFileInfo


class HybridExtractionWorkflowInput(BaseModel):
    """Input schema for the hybrid extraction orchestrator.

    Provides the required file metadata and project context to initiate
    the hybrid workflow. The orchestrator will use this input to dynamically
    route pages to Light ON OCR or Docling depending on whether the pages
    are scanned or natively digital.

    Attributes:
        file_info (DmsFileInfo): Metadata and storage information for the target PDF.
        project_id (UUID): The unique identifier of the project associated with the file.
    """

    file_info: DmsFileInfo
    project_id: UUID


class HybridExtractionWorkflowOutput(BaseModel):
    """Output schema for the hybrid extraction orchestrator.

    Contains the final combined results from both the Light ON OCR and
    Docling extraction processes.

    Attributes:
        markdown (str): The final, sanitized markdown text extracted from the PDF,
            combining the outputs of both extraction methods and including
            injected page numbers where applicable.
    """

    markdown: str
