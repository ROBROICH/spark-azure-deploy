"""Pydantic I/O models for postprocessing activities."""

from uuid import UUID

from pydantic import BaseModel
from temporal import Base64Bytes
from temporal.contracts import BaseMetadata, SummaryData

from src.providers.base import ContentItemDict
from src.schemas import Chunk, DocumentTopic, ProcessedDocument
from src.workflows.summarization.output_format import SummaryOutput
from src.workflows.types import SingleDocumentWorkflowOutput

__all__ = [
    "AssembleFinalJsonResult",
    "ChunkMarkdownInput",
    "CreateFinalJsonInput",
    "CreateSummaryFromResultsInput",
    "FilterEnhanceInput",
    "FilterEnhanceResult",
    "SplitMarkdownByPagesInput",
    "SummaryResult",
    "UploadImagesToDmsInput",
]


class FilterEnhanceInput(BaseModel):
    """Input for filter_enhance_content activity."""

    markdown: str = ""
    content_list: list[ContentItemDict] = []
    image_bytes: dict[str, Base64Bytes] = {}
    image_refs: dict[str, str] = {}  # filename -> DMS file_id (per-chunk upload path)
    project_id: UUID
    filename: str


class FilterEnhanceResult(BaseModel):
    """Output from filter_enhance_content containing filtered markdown, content list, and image data."""

    markdown: str
    content_list: list[ContentItemDict]
    images: dict[str, Base64Bytes]
    image_refs: dict[str, str] = {}  # filename -> DMS file_id (when uploaded in filter_enhance)


class AssembleFinalJsonResult(BaseModel):
    """Result from assemble_and_upload_final_json activity."""

    final_json_file_id: UUID
    filename: str
    processed_document: ProcessedDocument | None = None


class SummaryResult(BaseModel):
    """Result from create_summary_from_results activity."""

    summary_file_id: str
    filename: str
    summary_data: SummaryData


class CreateSummaryFromResultsInput(BaseModel):
    """Input for create_summary_from_results activity."""

    results: list[SingleDocumentWorkflowOutput]
    project_id: UUID
    base_metadata: BaseMetadata | None
    total_duration_seconds: float = 0.0


class ChunkMarkdownInput(BaseModel):
    """Input for chunk_markdown activity."""

    markdown: str
    content_list: list[ContentItemDict]


class ChunkMarkdownOnlyParentChunksInput(BaseModel):
    """Input schema for the markdown chunking activity.

    Provides the raw markdown to be processed into logical, parent-level text chunks.

    Attributes:
        markdown (str): The full, combined markdown text extracted from
            the document.
    """

    markdown: str


class SplitMarkdownByPagesInput(BaseModel):
    """Input for split_markdown_by_pages activity."""

    markdown: str
    pages_per_chunk: int = 1


class UploadImagesToDmsInput(BaseModel):
    """Input for upload_images_to_dms activity."""

    images: dict[str, Base64Bytes]
    project_id: UUID
    filename: str


class CreateFinalJsonInput(BaseModel):
    """Input for create_final_json activity."""

    final_markdown: str
    chunks: list[Chunk]
    summary_result: SummaryOutput | None
    base_metadata: BaseMetadata | None
    original_filename: str
    project_id: UUID
    processing_duration_seconds: float
    source_file_id: str | None = None
    document_theme: DocumentTopic | None = None
