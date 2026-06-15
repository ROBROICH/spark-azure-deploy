import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from temporal.utils import WorkflowName

PROCESS_DOCUMENTS_WORKFLOW_ID = WorkflowName("process-documents-workflow")
PROCESS_DOCUMENTS_EWMS_WORKFLOW_ID = WorkflowName("process-documents-ewms-workflow")
ENSURE_QDRANT_WORKFLOW_ID = WorkflowName("ensure-qdrant-workflow")
CHECK_QDRANT_INDEXED_WORKFLOW_ID = WorkflowName("check-qdrant-indexed-workflow")
BUILD_QDRANT_FROM_GRAPH_WORKFLOW_ID = WorkflowName("build-qdrant-from-graph-workflow")
QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW_ID = WorkflowName("qdrant-source-file-cleanup-workflow")
QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW_ID = WorkflowName(
    "qdrant-source-file-cleanup-compensation-workflow"
)
TASK_QUEUE = "extraction"


class BaseMetadata(BaseModel):
    """Base metadata extracted from a priority document (e.g., Erläuterungsbericht)."""

    application_id: str
    processing_timestamp: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
    )
    project_applicant: str | None = None
    planned_project: str | None = None
    project_location: str | None = None
    affected_municipalities: list[str] = Field(default_factory=list)
    affected_federal_states: list[str] = Field(default_factory=list)
    planning_company: str | None = None
    application_subject: str | None = None
    pipeline_length: str | None = None
    pipeline_diameter: str | None = None
    application_receipt_date: str | None = None
    responsible_planning_authority: str | None = None


class SubChunk(BaseModel):
    """Represents a sub-chunk of a larger document chunk."""

    chunk_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    parent_chunk_id: uuid.UUID | None = None
    page_content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    header: str | None = None


class PageIndexNode(BaseModel):
    """Represents a summary of the section if the chunk is a header node."""

    node_id: str
    summary: str


class Chunk(BaseModel):
    """Represents a chunk of the document, split by headers."""

    chunk_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    parent_chunk_id: uuid.UUID | None = None
    page_content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    sub_chunks: list[SubChunk] = Field(default_factory=list)
    header: str | None = None
    page_index_node: PageIndexNode | None = None


class DocumentTypeInfo(BaseModel):
    """Nested document type classification result with provenance tracking."""

    name: str | None = None
    category: str | None = None
    description: str | None = None
    confidence: float | None = None
    reasoning: str | None = None
    source: str = "ai"  # "ai" or "user"


class DocumentTopic(BaseModel):
    """Represents the main topic for a document."""

    id: UUID
    name: str
    description: str | None = None


class Metadata(BaseModel):
    """Represents the final, assembled metadata for a processed document."""

    document_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for the document.",
    )
    original_document_name: str = Field(..., description="The original filename of the document.")
    source_file_id: str | None = Field(
        None,
        description="DMS file_id of the original source document (e.g. the uploaded PDF).",
    )
    document_type: DocumentTypeInfo | None = Field(
        None,
        description="Nested document type classification with provenance.",
    )
    pages: int | None = Field(None, description="The total number of pages in the document.")
    base_metadata_status: str | None = Field(
        None,
        description="Status of the base metadata extraction (Erläuterungsbericht).",
    )
    base_metadata: BaseMetadata | None = Field(
        None,
        description=("The extracted metadata from the priority document (Erläuterungsbericht)."),
    )
    summary: str = Field(..., description="A generated summary of the document's content.")
    processing_duration_seconds: float | None = Field(
        None, description="The time in seconds it took to process the document."
    )

    project_id: str | None = None

    document_topic: DocumentTopic | None = None


class ProcessedDocument(BaseModel):
    """Represents the final processed document including content and metadata."""

    metadata: Metadata
    markdown_content: str
    chunks: list[Chunk] = Field(
        default_factory=list,
        description="The markdown content split into chunks by headers.",
    )


class ProcessedFileInfo(BaseModel):
    """Information about a single processed document file."""

    document_name: str
    document_path: str
    processed_json_file_id: str
    source_file_id: UUID | None = None
    processed_document: ProcessedDocument | None = None


class SummaryData(BaseModel):
    """Typed structure for the summary.json content."""

    base_metadata: BaseMetadata | None = None
    total_duration_seconds: float
    processed_files: list[ProcessedFileInfo]


class ProcessDocumentsEWMSWorkflowInput(BaseModel):
    """Input schema for batch processing multiple documents.

    Attributes:
        file_ids (list[UUID]): A list of unique identifiers for the files to process.
        project_id (UUID): The unique identifier of the associated project.
    """

    file_ids: list[UUID]
    project_id: UUID


class ProcessDocumentsWorkflowInput(BaseModel):
    """Input for the document processing workflow."""

    file_ids: list[UUID]
    project_id: UUID
    possible_topics: list[DocumentTopic] | None = None


class ChunkEWMS(BaseModel):
    """Custom document chunk for the EWMS pipeline.

    Represents a specific segment of the processed document that has been
    split by headers, tailored specifically for EWMS requirements.

    Attributes:
        chunk_id (uuid.UUID): A unique identifier for the chunk, auto-generated.
        page_content (str): The extracted markdown or text content of the chunk.
        page_numbers (list[int]): A list of the specific page numbers this chunk spans across.
    """

    chunk_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    page_content: str
    page_numbers: list[int]


class PromptInjection(BaseModel):
    """Prompt injection detection result for a single document.

    Attributes:
        injection_detected: Whether a prompt injection was detected.
        snippet: The offending chunk that triggered detection, None if clean.
    """

    injection_detected: bool
    snippet: str | None = None


class SingleDocumentEWMSWorkflowOutput(BaseModel):
    """Output schema for a single processed document.

    Attributes:
        prompt_injection (PromptInjection): Whether the markdown contains a prompt_injection
        markdown (str): The full extracted markdown text of the document.
        chunks (list[ChunkEWMS]): The structured, text chunks
            generated from the markdown.
        original_file_id (str): The unique identifier of the source file.
    """

    prompt_injection: PromptInjection
    markdown: str
    chunks: list[ChunkEWMS]
    original_file_id: str


class ProcessDocumentsEWMSWorkflowOutput(BaseModel):
    """Output schema for the batch document processing workflow.

    Attributes:
        processed_files_output (list[SingleDocumentEWMSWorkflowOutput]): A list
            containing the extraction and chunking results for each successfully
            processed file.
    """

    processed_files_output: list[SingleDocumentEWMSWorkflowOutput]


class ProcessDocumentsWorkflowOutput(BaseModel):
    """Output from the document processing workflow."""

    summary_file_id: UUID
    summary_data: SummaryData
    processed_file_ids: list[UUID]


class EnsureQdrantInput(BaseModel):
    """Input for ensure_qdrant — reuses ProcessedFileInfo like insert_extraction_results."""

    project_id: str
    processed_files: list[ProcessedFileInfo] | None = None


class EnsureQdrantOutput(BaseModel):
    """Output from ensure_qdrant workflow."""

    already_indexed: bool = False
    indexed_now: bool = False
    processed_ids: list[str] = Field(default_factory=list)
    failed_ids: list[str] = Field(default_factory=list)


class QdrantSourceFileCleanupInput(BaseModel):
    project_id: str
    source_file_ids: list[str]
    marker: str
    project_version: int


class QdrantSourceFileCleanupOutput(BaseModel):
    processed_file_ids: list[str] = Field(default_factory=list)


class DeleteDocumentsWorkflowInput(BaseModel):
    """Input for deleting project documents and their derived data."""

    project_id: UUID
    file_ids: list[UUID]


class DeleteDocumentsWorkflowOutput(BaseModel):
    """Summary of deleted DMS files, summary updates, and Qdrant point deletions."""

    project_id: UUID
    documents_deleted: list[str] = Field(default_factory=list)
    documents_failed: list[str] = Field(default_factory=list)
    content_extractions_deleted: list[str] = Field(default_factory=list)
    content_extractions_failed: list[str] = Field(default_factory=list)
    summary_update_success: list[str] = Field(default_factory=list)
    summary_update_failed: list[str] = Field(default_factory=list)
    qdrant_deleted: list[str] = Field(default_factory=list)
    qdrant_failed: list[str] = Field(default_factory=list)
