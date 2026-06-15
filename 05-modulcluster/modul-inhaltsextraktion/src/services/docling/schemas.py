"""Pydantic I/O models for Docling extraction activities."""

from uuid import UUID

from pydantic import BaseModel
from temporal import Base64Bytes

from src.activities.dms_activities import DmsFileInfo
from src.providers.base import ContentItemDict

__all__ = [
    "CombineDoclingChunksInput",
    "CombineDoclingChunksOutput",
    "CompressPdfImagesInput",
    "CompressPdfImagesOutput",
    "DeduplicateImagesInput",
    "DeduplicateImagesOutput",
    "DoclingActivityInput",
    "DoclingChunkResult",
    "ExtractChunkInput",
    "PreparedPdfOutput",
    "RasterizeChunkInput",
    "RasterizeChunkOutput",
    "SplitPdfForDoclingInput",
    "SplitPdfForDoclingOutput",
    "SubmitChunkInput",
    "SubmitChunkOutput",
    "WaitForChunkInput",
    "WaitForChunkOutput",
]


class DoclingActivityInput(BaseModel):
    """Input for the Docling extraction orchestrator."""

    file_info: DmsFileInfo
    project_id: UUID


class PreparedPdfOutput(BaseModel):
    """Output from download_and_prepare_pdf activity."""

    pdf_bytes: Base64Bytes
    filename: str
    file_size_mb: float


class SplitPdfForDoclingInput(BaseModel):
    """Input for split_pdf_for_docling activity."""

    pdf_bytes: Base64Bytes
    file_size_mb: float
    force_split: bool = False


class SplitPdfForDoclingOutput(BaseModel):
    """Output from split_pdf_for_docling activity."""

    chunks: list[Base64Bytes]
    page_offsets: list[int]  # Starting page number for each chunk


class ExtractChunkInput(BaseModel):
    """Input for extract_chunk_with_docling activity."""

    chunk_bytes: Base64Bytes
    chunk_index: int
    total_chunks: int
    page_offset: int  # Starting page number for this chunk
    output_prefix: str
    filename: str
    project_id: UUID | None = None


class DoclingChunkResult(BaseModel):
    """Result from processing a single chunk with Docling.

    For split documents, images are uploaded to DMS per-chunk.
    Markdown and content_list are always carried inline — Temporal's S3
    payload codec transparently offloads serialized payloads >100KB.
    """

    md_content: str = ""
    content_list: list[ContentItemDict] = []
    images: dict[str, Base64Bytes] = {}  # Fallback only; empty when per-chunk upload succeeds
    image_refs: dict[str, str] = {}  # filename -> DMS file_id (lightweight refs)
    original_md_content: str | None = None
    page_offset: int = 0


class SubmitChunkInput(BaseModel):
    """Input for submit_chunk_to_docling activity."""

    chunk_bytes: Base64Bytes
    chunk_index: int
    total_chunks: int
    filename: str


class SubmitChunkOutput(BaseModel):
    """Output from submit_chunk_to_docling activity."""

    task_id: str


class WaitForChunkInput(BaseModel):
    """Input for wait_for_docling_result activity.

    Note: chunk_bytes is serialized into Temporal payloads a second time (also
    in SubmitChunkInput).  This is acceptable because Temporal's S3 payload
    codec (always active in this service) transparently offloads payloads >2 KB
    to S3, so only a lightweight reference travels through workflow history.
    """

    task_id: str
    chunk_bytes: Base64Bytes  # Needed for post-processing (table cropping, image extraction)
    chunk_index: int
    total_chunks: int
    page_offset: int
    output_prefix: str
    filename: str
    project_id: UUID | None = None
    skip_dms: bool = False


class WaitForChunkOutput(BaseModel):
    """Output from wait_for_docling_result activity."""

    task_not_found: bool = False
    result: DoclingChunkResult | None = None  # None only when task_not_found=True


class CombineDoclingChunksInput(BaseModel):
    """Input for combine_docling_chunks activity."""

    chunk_results: list[DoclingChunkResult]
    project_id: UUID | None = None
    filename: str | None = None


class CombineDoclingChunksOutput(BaseModel):
    """Output from combine_docling_chunks activity.

    Markdown and content_list are always carried inline — Temporal's S3
    payload codec transparently offloads serialized payloads >100KB.
    """

    md_content: str = ""
    content_list: list[ContentItemDict] = []
    images: dict[str, Base64Bytes] = {}  # Fallback only; empty when per-chunk upload succeeds
    image_refs: dict[str, str] = {}  # filename -> DMS file_id (lightweight refs)
    original_md_content: str | None = None


class DeduplicateImagesInput(BaseModel):
    """Input for deduplicate_images activity."""

    content_list: list[ContentItemDict]
    images: dict[str, Base64Bytes]


class DeduplicateImagesOutput(BaseModel):
    """Output from deduplicate_images activity."""

    images: dict[str, Base64Bytes]
    duplicate_paths: list[str]


class CompressPdfImagesInput(BaseModel):
    """Input for compress_pdf_images activity."""

    pdf_bytes: Base64Bytes
    file_size_mb: float


class CompressPdfImagesOutput(BaseModel):
    """Output from compress_pdf_images activity."""

    pdf_bytes: Base64Bytes
    file_size_mb: float
    was_compressed: bool


class RasterizeChunkInput(BaseModel):
    """Input for rasterize_chunk activity."""

    chunk_bytes: Base64Bytes
    chunk_index: int
    total_chunks: int


class RasterizeChunkOutput(BaseModel):
    """Output from rasterize_chunk activity."""

    rasterized_bytes: Base64Bytes
    original_size_mb: float
    rasterized_size_mb: float
