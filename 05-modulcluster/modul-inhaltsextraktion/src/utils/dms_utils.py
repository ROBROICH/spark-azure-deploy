# src/utils/dms_utils.py
"""
DMS (Document Management Service) storage utilities.

This module provides storage operations through the central DMS service,
which abstracts the underlying storage and provides file management
via UUIDs.

Key differences from gcs_utils/s3_utils:
- DMS uses file_ids (UUIDs) instead of paths for most operations
- Uploads require project_id and file_type
- Downloads generate signed URLs internally
"""

from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from temporal import Base64Bytes
from temporal.dms_client import DmsClient, DmsConflictError
from temporalio import activity

from src.config import get_config
from src.env import ENV

# --- Pydantic Models ---


class CamelConfig:
    """Shared config for camelCase aliases and ORM mode."""

    model_config = ConfigDict(alias_generator=to_camel, from_attributes=True, populate_by_name=True)


class FileObject(BaseModel, CamelConfig):
    """File object returned by the DMS API."""

    id: UUID = Field(..., description="File UUID")
    type: str = Field(..., description="File type (document, content_extraction, etc.)")
    filename: str = Field(..., description="Original filename")
    mime_type: str = Field(..., description="MIME type")
    bucket_path: PurePosixPath = Field(..., description="Full path in bucket")

    project_id: UUID | None = Field(None, description="Project scope")
    workflow_id: str | None = Field(None, description="Temporal workflow id")
    run_id: str | None = Field(None, description="Temporal run id")
    vector_searchable: bool | None = Field(None, description="If file is vectorized")
    project_version: int | None = Field(None, description="Project version scope")

    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class FileUploadArgs(BaseModel, CamelConfig):
    """Arguments for uploading a file to DMS."""

    filename: str
    project_id: str
    type: str  # e.g., "document", "content_extraction"


# --- HTTP Client ---

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Get or create the async HTTP client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(float(get_config().DMS_TIMEOUT)),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )
        activity.logger.info(f"Initialized DMS client (base_url: {ENV.DMS_BASE_URL})")
    return _client


async def _close_client() -> None:
    """Close the HTTP client (call on shutdown)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _dms() -> DmsClient:
    return DmsClient(ENV.DMS_BASE_URL, http_client=_get_client)


# --- Core DMS API Functions (file_id based) ---


async def get_file_metadata(file_id: UUID) -> FileObject:
    """
    Get metadata for a file by its ID.

    Args:
        file_id: The UUID of the file

    Returns:
        FileObject with file metadata

    Raises:
        FileNotFoundError: If file doesn't exist
        httpx.HTTPStatusError: For other HTTP errors
    """
    return FileObject(**await _dms().get_file_metadata(file_id))


async def download_file(file_id: str | UUID) -> bytes:
    """
    Download a file by its ID.

    Args:
        file_id: The UUID of the file

    Returns:
        File contents as bytes

    Raises:
        FileNotFoundError: If file doesn't exist
        httpx.HTTPStatusError: For other HTTP errors
    """
    return await _dms().download_bytes(file_id)


async def download_file_as_stream(file_id: str) -> BytesIO:
    """
    Download a file by its ID as a BytesIO stream.

    Args:
        file_id: The UUID of the file

    Returns:
        File contents as BytesIO
    """
    content = await download_file(file_id)
    return BytesIO(content)


class ListFilesInput(BaseModel):
    """Input for the list_files DMS operation."""

    project_id: UUID
    file_type: str = "document"
    page: int = 1
    page_size: int = 500


async def list_files(input: ListFilesInput) -> list[FileObject]:
    records = await _dms().list_files_page(
        input.project_id,
        input.file_type,
        page=input.page,
        page_size=input.page_size,
    )
    return [FileObject(**file_data) for file_data in records]


async def list_all_files(project_id: UUID, file_type: str = "document") -> list[FileObject]:
    config = get_config()
    page_size = config.DMS_LIST_PAGE_SIZE
    all_files: list[FileObject] = []
    for page in range(1, config.DMS_LIST_MAX_PAGES + 1):
        batch = await list_files(
            ListFilesInput(project_id=project_id, file_type=file_type, page=page, page_size=page_size)
        )
        all_files.extend(batch)
        if len(batch) < page_size:
            return all_files
    activity.logger.warning(
        f"DMS listing for project {project_id} (type {file_type}) stopped after "
        f"{config.DMS_LIST_MAX_PAGES} pages with {len(all_files)} files; further files are ignored"
    )
    return all_files


class DmsUploadInput(BaseModel):
    """Input for DMS file upload via signed URL."""

    data: Base64Bytes
    filename: str
    project_id: UUID
    file_type: str = "content_extraction"
    content_type: str = "application/octet-stream"
    extra_params: dict[str, Any] | None = None


async def upload_file(
    input: DmsUploadInput,
) -> FileObject:
    """Upload a file to DMS using the generate-upload-url / confirm-upload flow."""
    record = await _dms().upload_content(
        input.project_id,
        input.filename,
        input.data,
        file_type=input.file_type,
        content_type=input.content_type,
        extra_params=input.extra_params,
    )
    return FileObject(**record)


async def delete_file(file_id: UUID) -> None:
    """
    Delete a file by its ID.

    Args:
        file_id: The UUID of the file

    Note:
        This is idempotent - doesn't raise error if file doesn't exist.
    """
    await _dms().delete_file(file_id)


async def upload_file_overwrite(input: DmsUploadInput) -> FileObject:
    """Upload a file, replacing any existing file at the same path.

    On 409 Conflict, finds the existing file by listing project files, deletes it,
    then retries. Safe to call on Temporal activity retries.
    """
    try:
        return await upload_file(input)
    except DmsConflictError:
        files = await list_all_files(input.project_id, input.file_type)
        for f in files:
            if f.filename == input.filename:
                activity.logger.info(f"Replacing existing DMS file '{input.filename}' (id={f.id})")
                await delete_file(f.id)
                break
        return await upload_file(input)
