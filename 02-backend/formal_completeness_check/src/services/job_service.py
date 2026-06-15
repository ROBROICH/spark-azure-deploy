"""Service for processing completed formal completeness check jobs."""

from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx
from authentification.internal_api_key import internal_api_key_headers
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, retry_if_exception_type, stop_after_attempt

from src.config.settings import settings
from src.exceptions.exceptions import NotFoundError
from src.models.schemas.fcs_types import (
    FileDownloadResponse,
    FormalCompletenessCheckResults,
    JobDoneResponse,
)
from src.services.fcs_service import (
    replace_results_for_files,
)
from src.utils.logger import logger


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_file_metadata(file_id: UUID, project_version: int | None = None) -> dict[str, Any]:
    """Fetch file metadata from Document Management Service."""
    base_url = settings.DOCUMENT_MANAGEMENT_SERVICE_URL.rstrip("/")
    metadata_endpoint = f"{base_url}/v2/files/{file_id}"
    params = {"project_version": project_version} if project_version is not None else None
    async with httpx.AsyncClient(timeout=30.0, headers=internal_api_key_headers()) as client:
        response = await client.get(metadata_endpoint, params=params)
        response.raise_for_status()
        return response.json()


async def verify_file_project_binding(file_id: UUID, project_id: UUID, project_version: int | None = None) -> int:
    """Verify that the file belongs to the project without leaking cross-project existence."""
    try:
        metadata = await _fetch_file_metadata(file_id, project_version)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == HTTPStatus.NOT_FOUND:
            raise NotFoundError(f"File '{file_id}' not found.") from e
        raise

    file_project_id = metadata["projectId"]
    if file_project_id is None or str(file_project_id) != str(project_id):
        logger.warn(
            EventAction.VALIDATE,
            EventOutcome.FAILURE,
            EventCategory.API,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"File '{file_id}' does not belong to project '{project_id}'",
        )
        raise NotFoundError("File not found in project.")
    return int(metadata["projectVersion"])


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_download_url(
    download_url_endpoint: str,
    project_version: int | None = None,
) -> FileDownloadResponse:
    """Fetch presigned download URL for a file from Document Management Service."""
    params = {"project_version": project_version} if project_version is not None else None
    async with httpx.AsyncClient(timeout=30.0, headers=internal_api_key_headers()) as client:
        response = await client.get(download_url_endpoint, params=params)
        response.raise_for_status()
        return FileDownloadResponse.model_validate(response.json())


@retry(
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
)
async def _fetch_json_content(
    download_url: str,
) -> FormalCompletenessCheckResults:
    """Fetch and parse JSON content from presigned URL."""
    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={
            "Content-Type": "application/json",
        },
    ) as gcs_client:
        response = await gcs_client.get(download_url)
        response.raise_for_status()
        return FormalCompletenessCheckResults.model_validate_json(response.content)


async def fetch_results_file(file_id: UUID, project_version: int | None = None) -> FormalCompletenessCheckResults:
    """Fetch and parse the results JSON from Document Management Service."""
    base_url = settings.DOCUMENT_MANAGEMENT_SERVICE_URL.rstrip("/")
    download_url_endpoint = f"{base_url}/v2/files/{file_id}/generate-download-url"

    logger.debug(
        EventAction.READ,
        EventOutcome.UNKNOWN,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Fetching download URL from {download_url_endpoint}",
    )

    download_info = await _fetch_download_url(download_url_endpoint, project_version)
    logger.debug(
        EventAction.READ,
        EventOutcome.SUCCESS,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Obtained presigned download URL for file_id={file_id}",
    )

    return await _fetch_json_content(download_info.download_url)


async def process_job_results(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession,
    project_version: int | None = None,
) -> JobDoneResponse:
    """Process job results: fetch, delete old data, insert new data.

    This operation is atomic - either all changes succeed or none are applied.

    Raises:
        httpx.HTTPStatusError: If fetching results file fails.
    """

    logger.info(
        EventAction.WRITE,
        EventOutcome.UNKNOWN,
        EventCategory.DATABASE,
        default_event=LogEventDefault.GENERAL,
        message=f"Processing job results for project_id={project_id}, file_id={file_id}",
    )

    project_version = await verify_file_project_binding(file_id, project_id, project_version)

    logger.info(
        EventAction.READ,
        EventOutcome.UNKNOWN,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message="Fetching results file from document management service",
    )
    results = await fetch_results_file(file_id, project_version)

    if not results.matched_document_types and not results.unassigned_documents:
        logger.warn(
            EventAction.VALIDATE,
            EventOutcome.UNKNOWN,
            EventCategory.DATABASE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"Results contain no document types or unassigned documents for project_id={project_id}",
        )

    logger.info(
        EventAction.READ,
        EventOutcome.SUCCESS,
        EventCategory.API,
        default_event=LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
        message=f"Fetched results: {len(results.matched_document_types)} matched document types, {len(results.unassigned_documents)} unassigned documents",
    )

    matched_count = len(results.matched_document_types)
    assigned_count = sum(len(mt.assigned_documents) for mt in results.matched_document_types)
    unassigned_count = len(results.unassigned_documents)

    try:
        logger.info(
            EventAction.DELETE,
            EventOutcome.UNKNOWN,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Replacing candidate FCS data for project_id={project_id}",
        )
        deleted_count = await replace_results_for_files(project_id, results, db, project_version=project_version)

        logger.info(
            EventAction.WRITE,
            EventOutcome.UNKNOWN,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Inserted candidate FCS data for project_id={project_id}",
        )

        await db.commit()
        logger.info(
            EventAction.WRITE,
            EventOutcome.SUCCESS,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_COMMIT,
            message=f"Successfully processed job results for project_id={project_id}",
        )

        status = "no_results" if not matched_count and not unassigned_count else "results_processed"

        return JobDoneResponse(
            status=status,
            matched_document_types=matched_count,
            assigned_documents=assigned_count,
            unassigned_documents=unassigned_count,
            previous_records_deleted=deleted_count,
        )

    except Exception as e:
        logger.error(
            EventAction.WRITE,
            EventOutcome.FAILURE,
            EventCategory.DATABASE,
            default_event=LogEventDefault.DB_ERROR,
            message=f"Failed to process job results for project_id={project_id}: {e!s}",
        )
        await db.rollback()
        raise
